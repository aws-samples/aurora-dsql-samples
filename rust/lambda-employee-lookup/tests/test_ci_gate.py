"""Exercise the CI gate's changed-path script without GitHub API calls."""

import json
from pathlib import Path
import subprocess
import textwrap
import unittest


WORKFLOW = Path(__file__).resolve().parents[3] / ".github/workflows/ci-gate.yml"


def detect(files, workflow=WORKFLOW):
    lines = workflow.read_text().splitlines()
    start = lines.index("          script: |") + 1
    end = start
    while end < len(lines) and (not lines[end].strip() or lines[end].startswith("            ")):
        end += 1
    script = textwrap.dedent("\n".join(lines[start:end]))
    runner = r"""
const fs = require('node:fs');
const {script, files} = JSON.parse(fs.readFileSync(0, 'utf8'));
const outputs = {};
const pr = {
  number: 1677, state: 'open', changed_files: files.length,
  head: {
    sha: '0123456789012345678901234567890123456789',
    repo: {full_name: 'mkduvva/aurora-dsql-samples'}
  },
  base: {sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'}
};
const context = {
  payload: {pull_request: pr},
  repo: {owner: 'aws-samples', repo: 'aurora-dsql-samples'},
  sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
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
        input=json.dumps({"script": script, "files": files}),
        text=True, capture_output=True, check=True,
    )
    return json.loads(result.stdout)


class CiGateTests(unittest.TestCase):
    def test_workflow_change_runs_sample_checks(self):
        outputs = detect([".github/workflows/rust-lambda-employee-lookup-integ-tests.yml"])
        self.assertEqual(outputs["rust-lambda-employee-lookup"], "true")

    def test_sample_change_tests_pr_head(self):
        outputs = detect(["rust/lambda-employee-lookup/src/main.rs"])
        self.assertEqual(outputs["rust-lambda-employee-lookup"], "true")
        self.assertEqual(outputs["checkout-ref"], "0123456789012345678901234567890123456789")

    def test_unrelated_change_does_not_run_sample_checks(self):
        outputs = detect(["README.md"])
        self.assertEqual(outputs["rust-lambda-employee-lookup"], "false")


if __name__ == "__main__":
    unittest.main()
