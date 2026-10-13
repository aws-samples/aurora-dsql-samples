"""Exercise changed-path detection and checkout-ref dataflow without GitHub API calls."""

import json
from pathlib import Path
import re
import subprocess
import unittest

import yaml


REPO_ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = REPO_ROOT / ".github/workflows/ci-gate.yml"
PR_HEAD = "0123456789012345678901234567890123456789"
MAIN_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"


def load_workflow(path):
    # Keep GitHub's YAML 1.2 `on` key and scalar ref values as strings.
    return yaml.load(path.read_text(), Loader=yaml.BaseLoader)


def resolve_ref(expression, context):
    """Resolve only the dotted-property / || expressions used by the ref mappings."""
    if not expression.startswith("${{"):
        return expression
    if not expression.endswith("}}"):
        raise AssertionError(f"Unsupported ref expression: {expression}")
    for term in expression[3:-2].split("||"):
        term = term.strip()
        if not re.fullmatch(r"[\w-]+(?:\.[\w-]+)+", term):
            raise AssertionError(f"Unsupported ref expression: {expression}")
        value = context
        for key in term.split("."):
            value = value.get(key, "") if isinstance(value, dict) else ""
        if value:
            return value
    return ""


def detect(files, workflow=WORKFLOW, pull_request=True):
    steps = load_workflow(workflow)["jobs"]["changes"]["steps"]
    script = next(step for step in steps if step.get("id") == "detect")["with"]["script"]
    runner = r"""
const fs = require('node:fs');
const {script, files, pullRequest, prHead, mainSha} = JSON.parse(fs.readFileSync(0, 'utf8'));
const outputs = {};
const pr = {
  number: 1677, state: 'open', changed_files: files.length,
  head: {
    sha: prHead,
    repo: {full_name: 'mkduvva/aurora-dsql-samples'}
  },
  base: {sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'}
};
const context = {
  payload: pullRequest ? {pull_request: pr} : {},
  repo: {owner: 'aws-samples', repo: 'aurora-dsql-samples'},
  sha: mainSha
};
const core = {
  setOutput: (name, value) => { outputs[name] = value; },
  setFailed: message => { throw new Error(message); }
};
const github = {
  rest: {
    pulls: {listFiles: () => {}, get: async () => ({data: pr})},
    repos: {compareCommitsWithBasehead: async () => ({
      data: {files: files.map(filename => ({filename}))}
    })}
  },
  paginate: {iterator: async function* () {
    yield {data: files.map(filename => ({filename}))};
  }}
};
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
new AsyncFunction('context', 'core', 'github', script)(context, core, github)
  .then(() => process.stdout.write(JSON.stringify(outputs)))
  .catch(error => { console.error(error); process.exit(1); });
"""
    result = subprocess.run(
        ["node", "-e", runner],
        input=json.dumps({
            "script": script, "files": files, "pullRequest": pull_request,
            "prHead": PR_HEAD, "mainSha": MAIN_SHA,
        }),
        text=True, capture_output=True, check=True,
    )
    return json.loads(result.stdout)


class CiGateTests(unittest.TestCase):
    def assert_checkout_refs(self, workflow, inputs, github, expected):
        context = {"inputs": inputs, "github": github}
        self.assertTrue(workflow["jobs"], "No consumer jobs configured")
        for job_name, job in workflow["jobs"].items():
            if "uses" in job:
                continue  # Reusable cluster create/delete workflows check out no code.
            checkouts = [
                step for step in job.get("steps", [])
                if step.get("uses", "").split("@")[0] == "actions/checkout"
            ]
            self.assertTrue(checkouts, f"{job_name}: no checkout configured")
            for index, step in enumerate(checkouts):
                with self.subTest(job=job_name, checkout=index):
                    ref = resolve_ref(step.get("with", {}).get("ref", ""), context)
                    # An empty checkout ref uses the triggering event's commit.
                    self.assertEqual(ref or github["sha"], expected)

    def assert_gate_checkout_refs(self, outputs, github, expected,
                                  caller_name="rust-lambda-employee-lookup"):
        gate = load_workflow(WORKFLOW)
        job_outputs = {
            name: resolve_ref(expression, {"steps": {"detect": {"outputs": outputs}}})
            for name, expression in gate["jobs"]["changes"].get("outputs", {}).items()
        }
        caller = gate["jobs"][caller_name]
        workflow = load_workflow(REPO_ROOT / caller["uses"])
        declarations = workflow["on"]["workflow_call"].get("inputs", {})
        self.assertIn("checkout-ref", declarations, "The forwarded input must be declared")
        declaration = declarations["checkout-ref"]
        self.assertEqual(declaration.get("type"), "string")
        self.assertNotEqual(declaration.get("required", "false"), "true")
        forwarded = caller.get("with", {})
        self.assertLessEqual(forwarded.keys(), declarations.keys(), "Undeclared caller input")
        dependencies = caller.get("needs", [])
        if isinstance(dependencies, str):
            dependencies = [dependencies]
        needs = {"changes": {"outputs": job_outputs}} if "changes" in dependencies else {}
        ref = resolve_ref(
            forwarded.get("checkout-ref", declaration.get("default", "")),
            {"needs": needs, "github": github},
        )
        self.assertIsInstance(ref, str, "checkout-ref is a string workflow_call input")
        self.assert_checkout_refs(workflow, {"checkout-ref": ref}, github, expected)

    def test_workflow_change_runs_sample_checks(self):
        outputs = detect([".github/workflows/rust-lambda-employee-lookup-integ-tests.yml"])
        self.assertEqual(outputs["rust-lambda-employee-lookup"], "true")

    def test_dsql_workflow_change_runs_sample_checks(self):
        outputs = detect([".github/workflows/rust-lambda-employee-lookup-dsql-integ-tests.yml"])
        self.assertEqual(outputs["rust-lambda-employee-lookup"], "true")

    def test_dsql_job_runs_only_with_integration_credentials(self):
        gate = load_workflow(WORKFLOW)
        job = gate["jobs"]["rust-lambda-employee-lookup-dsql"]
        self.assertIn("needs.changes.outputs.run-integration == 'true'", job["if"])
        self.assertIn("needs.changes.outputs.rust-lambda-employee-lookup == 'true'", job["if"])
        self.assertEqual(job.get("secrets"), "inherit")
        self.assertEqual(job["permissions"].get("id-token"), "write")
        self.assertIn("rust-lambda-employee-lookup-dsql", gate["jobs"]["gate"]["needs"])

    def test_dsql_job_tests_pr_head(self):
        outputs = detect(["rust/lambda-employee-lookup/seed.sql"])
        self.assert_gate_checkout_refs(outputs, {
            "event_name": "workflow_run", "sha": MAIN_SHA,
            "event": {"workflow_run": {"head_sha": MAIN_SHA}},
        }, PR_HEAD, caller_name="rust-lambda-employee-lookup-dsql")

    def test_sample_change_tests_pr_head(self):
        outputs = detect(["rust/lambda-employee-lookup/src/main.rs"])
        self.assertEqual(outputs["rust-lambda-employee-lookup"], "true")
        self.assertEqual(outputs["checkout-ref"], PR_HEAD)
        self.assert_gate_checkout_refs(outputs, {
            "event_name": "workflow_run", "sha": MAIN_SHA,
            "event": {"workflow_run": {"head_sha": MAIN_SHA}},
        }, PR_HEAD)

    def test_forwarded_ref_takes_priority_over_pull_request_context(self):
        outputs = detect(["rust/lambda-employee-lookup/src/main.rs"])
        self.assert_gate_checkout_refs(outputs, {
            "event_name": "pull_request", "sha": MAIN_SHA,
            "event": {"pull_request": {"head": {"sha": "cccccccccccccccccccccccccccccccccccccccc"}}},
        }, PR_HEAD)

    def test_manual_dispatch_tests_main_sha(self):
        outputs = detect([], pull_request=False)
        self.assertEqual(outputs["rust-lambda-employee-lookup"], "true")
        self.assertEqual(outputs["checkout-ref"], MAIN_SHA)
        self.assert_gate_checkout_refs(outputs, {
            "event_name": "workflow_dispatch", "sha": MAIN_SHA, "event": {},
        }, MAIN_SHA)

    def test_reusable_workflow_without_input_uses_event_commit(self):
        caller = load_workflow(WORKFLOW)["jobs"]["rust-lambda-employee-lookup"]
        workflow = load_workflow(REPO_ROOT / caller["uses"])
        declaration = workflow["on"]["workflow_call"].get("inputs", {}).get("checkout-ref", {})
        inputs = {"checkout-ref": declaration.get("default", "")}
        for event_name, event, expected in (
            ("pull_request", {"pull_request": {"head": {"sha": PR_HEAD}}}, PR_HEAD),
            ("workflow_dispatch", {}, MAIN_SHA),
            ("push", {"ref": "refs/heads/main"}, MAIN_SHA),
        ):
            with self.subTest(event_name=event_name):
                self.assert_checkout_refs(workflow, inputs, {
                    "event_name": event_name, "sha": MAIN_SHA, "event": event,
                }, expected)

    def test_unrelated_change_does_not_run_sample_checks(self):
        outputs = detect(["README.md"])
        self.assertEqual(outputs["rust-lambda-employee-lookup"], "false")


if __name__ == "__main__":
    unittest.main()
