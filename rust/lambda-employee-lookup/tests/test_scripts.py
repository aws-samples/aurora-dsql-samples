"""Offline checks of the real shell entry points; AWS and build tools never connect."""

import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest


SAMPLE_ROOT = Path(__file__).resolve().parents[1]
SETUP_SCRIPTS = (
    "deploy/container/setup.sh",
    "deploy/zip/setup.sh",
    "setup-docker.sh",
    "setup-finch.sh",
)
REGION = "us-west-2"
ACCOUNT = "123456789012"
FUNCTION = "dsql-employee-lookup"
ROLE_ARN = f"arn:aws:iam::{ACCOUNT}:role/{FUNCTION}-role"
NEW_CLUSTER = "abcdefghijklmnopqrstuvwxyz"
REUSED_CLUSTER = "zyxwvutsrqponmlkjihgfedcba"
API_ENDPOINT = f"https://api123.execute-api.{REGION}.amazonaws.com"


# These doubles replace executable/network boundaries, not shell logic, jq,
# filesystem checks, or zip inspection. Build doubles create the artifacts the
# real commands produce, and AWS errors use the CLI's documented error codes.
MOCK_COMMAND = r'''
import json
import os
from pathlib import Path
import shlex
import sys
import zipfile

command = Path(sys.argv[0]).name
args = sys.argv[1:]
config = json.loads(Path(os.environ["SCRIPT_TEST_CONFIG"]).read_text())
region = os.environ["AWS_REGION"]
account = "123456789012"
function = "dsql-employee-lookup"
role_arn = f"arn:aws:iam::{account}:role/{function}-role"
event = {"command": command, "args": args, "cwd": os.getcwd()}

def option(name):
    return args[args.index(name) + 1]

for name in ("--policy-document", "--assume-role-policy-document"):
    if name in args:
        value = option(name)
        if value.startswith("file://"):
            path = Path(value[len("file://"):])
            event["policy_path"] = str(path)
            value = path.read_text()
        event[name] = json.loads(value)
if command == "psql":
    event["password"] = os.environ.get("PGPASSWORD")
with Path(os.environ["SCRIPT_TEST_LOG"]).open("a") as log:
    log.write(json.dumps(event) + "\n")

def error(code, operation, message):
    print(f"An error occurred ({code}) when calling the {operation} operation: {message}", file=sys.stderr)
    sys.exit(254)

def build(project, output_format):
    if not (project / "Cargo.toml").is_file():
        print(f"Cargo.toml not found in {project}", file=sys.stderr)
        sys.exit(1)
    target = project / "target" / "lambda" / function
    target.mkdir(parents=True, exist_ok=True)
    if output_format == "zip":
        with zipfile.ZipFile(target / "bootstrap.zip", "w") as archive:
            archive.writestr("bootstrap", b"#!/bin/sh\nexit 0\n")
    else:
        (target / "bootstrap").write_bytes(b"#!/bin/sh\nexit 0\n")

if command == "sleep":
    sys.exit(0)
if command == "cargo":
    if args[:2] != ["lambda", "build"]:
        sys.exit("Unexpected cargo command")
    build(Path.cwd(), option("--output-format"))
elif command in ("docker", "finch"):
    if args[0] == "run":
        mount = option("-v")
        if not mount.endswith(":/code") or option("-w") != "/code":
            sys.exit("Invalid project mount")
        cargo_args = shlex.split(args[-1].rsplit("&&", 1)[-1])
        if cargo_args[:3] != ["cargo", "lambda", "build"]:
            sys.exit("Unexpected container build command")
        build(Path(mount[:-len(":/code")]), cargo_args[cargo_args.index("--output-format") + 1])
    elif args[0] == "build":
        context = Path(args[-1]).resolve()
        dockerfile = Path(option("-f")).resolve() if "-f" in args else context / "Dockerfile"
        if not dockerfile.is_file() or not (context / "target" / "lambda" / function / "bootstrap").is_file():
            sys.exit("Dockerfile or bootstrap missing from build context")
    elif args[0] == "login":
        sys.stdin.read()
    elif args[0] != "push":
        sys.exit("Unexpected container command")
elif command == "aws":
    operation = tuple(args[:2])
    if list(operation) == config.get("fail_command"):
        error("AccessDenied" if args[0] == "iam" else "AccessDeniedException",
              "".join(word.title() for word in args[1].split("-")), "Not authorized")
    reused = config.get("reuse_resources", False)
    if operation == ("sts", "get-caller-identity"):
        print(account)
    elif operation == ("dsql", "create-cluster"):
        identifier = "abcdefghijklmnopqrstuvwxyz"
        print(json.dumps({
            "identifier": identifier,
            "arn": f"arn:aws:dsql:{region}:{account}:cluster/{identifier}",
            "endpoint": f"{identifier}.dsql.{region}.on.aws",
            "status": "CREATING", "deletionProtectionEnabled": False,
            "creationTime": "2026-10-13T00:00:00Z", "tags": {},
            "encryptionDetails": {"encryptionType": "AWS_OWNED_KMS_KEY", "encryptionStatus": "ENABLED"},
        }))
    elif operation == ("dsql", "get-cluster"):
        print("ACTIVE")
    elif operation == ("dsql", "generate-db-connect-admin-auth-token"):
        print("offline-admin-token")
    elif operation in (("iam", "get-role"), ("ecr", "describe-repositories")):
        if not reused:
            error("NoSuchEntity" if args[0] == "iam" else "RepositoryNotFoundException", args[1], "Not found")
        print("{}")
    elif operation in (("iam", "create-role"), ("ecr", "create-repository")):
        if reused:
            error("EntityAlreadyExists" if args[0] == "iam" else "RepositoryAlreadyExistsException", args[1], "Already exists")
        print(role_arn if args[0] == "iam" else "{}")
    elif operation == ("ecr", "get-login-password"):
        print("offline-password")
    elif operation == ("lambda", "create-function"):
        if "--zip-file" in args:
            path = Path(option("--zip-file")[len("fileb://"):])
            if not zipfile.is_zipfile(path):
                sys.exit("Lambda zip file not found")
        print(f"arn:aws:lambda:{region}:{account}:function:{function}")
    elif operation == ("logs", "create-log-group"):
        if config.get("existing_logs", reused):
            error("ResourceAlreadyExistsException", "CreateLogGroup", "Already exists")
        Path(os.environ["SCRIPT_TEST_LOG_GROUP"]).write_text(option("--log-group-name"))
    elif operation == ("logs", "put-retention-policy"):
        if not config.get("existing_logs", reused) and not Path(os.environ["SCRIPT_TEST_LOG_GROUP"]).is_file():
            error("ResourceNotFoundException", "PutRetentionPolicy", "Log group not found")
    elif operation == ("apigatewayv2", "create-api"):
        print(json.dumps({
            "ApiId": "api123", "ApiEndpoint": f"https://api123.execute-api.{region}.amazonaws.com",
            "Name": "dsql-employee-api", "ProtocolType": "HTTP", "RouteSelectionExpression": "$request.method $request.path",
            "ApiKeySelectionExpression": "$request.header.x-api-key", "CreatedDate": "2026-10-13T00:00:00Z",
            "DisableExecuteApiEndpoint": False, "Tags": {},
        }))
    elif operation == ("apigatewayv2", "create-integration"):
        print("integration123")
    elif operation not in {
        ("iam", "attach-role-policy"), ("iam", "put-role-policy"),
        ("lambda", "wait"), ("lambda", "add-permission"),
        ("apigatewayv2", "create-route"), ("apigatewayv2", "create-stage"),
    }:
        sys.exit(f"Unexpected AWS command: {args}")
elif command == "psql":
    if not Path(option("-f")).is_file():
        sys.exit("Seed file not found")
elif command == "curl":
    data = option("-d") if "-d" in args else ""
    john = {"id": "00000000-0000-0000-0000-000000000001", "name": "John Doe", "email": "john@example.com",
            "department": "Engineering", "title": "Engineer", "hire_date": "2024-01-01"}
    alice = {"id": "00000000-0000-0000-0000-000000000002", "name": "Alice Johnson", "email": "alice@example.com",
             "department": "Engineering", "title": "Engineer", "hire_date": "2024-01-02"}
    if data == "not valid json":
        response = {"status": "400", "body": json.dumps({"error": "Invalid request body"})}
    else:
        name = json.loads(data).get("name") if data else None
        employees = {"John": [john], "alice": [alice], "zzz": []}.get(name, [john, alice])
        response = {"status": "200", "body": json.dumps({"count": len(employees), "employees": employees, "next": None})}
    response.update(config.get("curl_responses", {}).get(data, {}))
    if not response.get("exit_code"):
        Path(option("-o")).write_text(response["body"])
    print(response["status"], end="")
    if response.get("exit_code"):
        print("curl: (7) Failed to connect", file=sys.stderr)
        sys.exit(response["exit_code"])
else:
    sys.exit(f"Unexpected command: {command}")
'''


class ScriptHarness:
    def __init__(self, sample_name="sample project"):
        self.directory = tempfile.TemporaryDirectory(prefix="employee-lookup-scripts-")
        self.base = Path(self.directory.name)
        self.project = self.base / sample_name
        self.bin = self.base / "bin"
        self.bin.mkdir()
        self.tmp = self.base / "tmp"
        self.tmp.mkdir()
        self.foreign = self.base / "elsewhere"
        self.foreign.mkdir()
        self.log = self.base / "commands.jsonl"
        self.config = self.base / "config.json"
        for name in (*SETUP_SCRIPTS, "test-api.sh", "Cargo.toml", "Cargo.lock", "Dockerfile", "seed.sql"):
            destination = self.project / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(SAMPLE_ROOT / name, destination)
            if destination.suffix == ".sh":
                destination.chmod(0o755)  # The README's chmod +x prerequisite.
        executable = self.bin / "mock-command"
        executable.write_text(f"#!{sys.executable}\n{MOCK_COMMAND}")
        executable.chmod(0o755)
        for name in ("aws", "cargo", "docker", "finch", "sleep", "psql", "curl"):
            (self.bin / name).symlink_to(executable.name)
        self.env = dict(os.environ)
        for name in ("API_URL", "API_ENDPOINT"):
            self.env.pop(name, None)
        self.env.update({
            "PATH": f"{self.bin}{os.pathsep}{os.environ['PATH']}",
            "AWS_REGION": REGION,
            "TMPDIR": str(self.tmp),
            "SCRIPT_TEST_LOG": str(self.log),
            "SCRIPT_TEST_CONFIG": str(self.config),
            "SCRIPT_TEST_LOG_GROUP": str(self.base / "log-group"),
        })
        self.configure()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.directory.cleanup()

    def configure(self, **config):
        self.config.write_text(json.dumps(config))
        self.log.write_text("")
        log_group = self.base / "log-group"
        if log_group.exists():
            log_group.unlink()

    def calls(self, command=None, operation=None):
        calls = [json.loads(line) for line in self.log.read_text().splitlines()]
        return [call for call in calls
                if (command is None or call["command"] == command)
                and (operation is None or call["args"][:len(operation)] == list(operation))]

    def run_setup(self, script, cwd, reuse_cluster=False):
        answers = f"y\n{REUSED_CLUSTER}.dsql.{REGION}.on.aws\n" if reuse_cluster else "n\n"
        return subprocess.run(
            [f"./{os.path.relpath(self.project / script, cwd)}"], cwd=cwd, env=self.env,
            input=answers, text=True, capture_output=True, timeout=20,
        )

    def run_api(self, **variables):
        env = dict(self.env, **variables)
        return subprocess.run(
            [f"./{os.path.relpath(self.project / 'test-api.sh', self.foreign)}"],
            cwd=self.foreign, env=env, text=True, capture_output=True, timeout=20,
        )


def argument(call, name):
    return call["args"][call["args"].index(name) + 1]


class BuildScriptTests(unittest.TestCase):
    def assert_success(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("SETUP COMPLETE!", result.stdout)

    def test_native_builds_find_project_from_any_directory(self):
        # Removing script-relative cd breaks the documented deploy/* entry path;
        # retaining ../../Dockerfile breaks the project-root entry path.
        for script in SETUP_SCRIPTS[:2]:
            with ScriptHarness() as harness:
                for cwd in (harness.project, (harness.project / script).parent, harness.foreign):
                    with self.subTest(script=script, cwd=cwd.name):
                        harness.configure()
                        result = harness.run_setup(script, cwd)
                        self.assert_success(result)
                        cargo, = harness.calls("cargo")
                        self.assertEqual(Path(cargo["cwd"]), harness.project)
                        self.assertEqual(cargo["args"], [
                            "lambda", "build", "--locked", "--release", "--arm64", "--output-format",
                            "zip" if "/zip/" in script else "binary",
                        ])
                        if "/container/" in script:
                            build, = harness.calls("docker", ("build",))
                            context = (Path(build["cwd"]) / build["args"][-1]).resolve()
                            self.assertEqual(context, harness.project)
                            dockerfile = argument(build, "-f") if "-f" in build["args"] else "Dockerfile"
                            self.assertEqual((Path(build["cwd"]) / dockerfile).resolve(), harness.project / "Dockerfile")
                        else:
                            create, = harness.calls("aws", ("lambda", "create-function"))
                            zip_path = argument(create, "--zip-file")[len("fileb://"):]
                            self.assertEqual(
                                (Path(create["cwd"]) / zip_path).resolve(),
                                harness.project / "target/lambda/dsql-employee-lookup/bootstrap.zip",
                            )

    def test_macos_builds_mount_project_and_lock_dependencies(self):
        # A caller-relative/unquoted mount misses Cargo.toml; dropping --locked
        # silently permits different dependency resolution inside the builder.
        for script, tool in (("setup-docker.sh", "docker"), ("setup-finch.sh", "finch")):
            with ScriptHarness() as harness:
                for cwd in (harness.project, harness.foreign):
                    with self.subTest(script=script, cwd=cwd.name):
                        harness.configure()
                        result = harness.run_setup(script, cwd)
                        self.assert_success(result)
                        run, = harness.calls(tool, ("run",))
                        self.assertEqual(argument(run, "-v"), f"{harness.project}:/code")
                        self.assertEqual(argument(run, "-w"), "/code")
                        cargo_args = shlex.split(run["args"][-1].rsplit("&&", 1)[-1])
                        self.assertEqual(cargo_args, [
                            "cargo", "lambda", "build", "--locked", "--release", "--arm64", "--output-format", "binary",
                        ])
                        build, = harness.calls(tool, ("build",))
                        self.assertEqual((Path(build["cwd"]) / build["args"][-1]).resolve(), harness.project)

    def test_macos_iam_policy_files_are_private_and_cleaned(self):
        # Reintroducing fixed /tmp paths or removing the exit trap leaves shared
        # IAM documents, even though the actual policy still looks correct.
        for script in SETUP_SCRIPTS[2:]:
            with self.subTest(script=script), ScriptHarness(sample_name="sample") as harness:
                result = harness.run_setup(script, harness.project)
                self.assert_success(result)
                for operation in (("iam", "create-role"), ("iam", "put-role-policy")):
                    call, = harness.calls("aws", operation)
                    policy_path = Path(call["policy_path"])
                    self.assertIn(harness.tmp, policy_path.parents)
                    self.assertFalse(policy_path.exists(), policy_path)

    def test_zip_size_display_does_not_require_undeclared_bc(self):
        # Reintroducing bc causes a command-not-found diagnostic even though
        # the build succeeds. All local utilities here are the real binaries.
        with ScriptHarness() as harness:
            for name in ("bash", "dirname", "jq", "cut", "stat", "unzip", "tail", "awk", "cat", "mktemp", "rm", "rmdir"):
                binary = shutil.which(name)
                self.assertIsNotNone(binary, f"Required local test utility: {name}")
                (harness.bin / name).symlink_to(binary)
            harness.env["PATH"] = str(harness.bin)
            result = harness.run_setup("deploy/zip/setup.sh", harness.foreign, reuse_cluster=True)
            self.assert_success(result)
            self.assertEqual(result.stderr, "")
            self.assertRegex(result.stdout, r"Zip: .*bootstrap\.zip \(0\.0 MB\)")


class DeploymentScriptTests(unittest.TestCase):
    def test_printed_seed_commands_target_lambda_readonly_role(self):
        # A caller-relative seed.sql, placeholder endpoint/ARN, admin Lambda
        # user, or overbroad IAM action breaks the actual copy/paste commands.
        for script in SETUP_SCRIPTS:
            for reused in (False, True):
                with self.subTest(script=script, reused=reused), ScriptHarness() as harness:
                    harness.configure(reuse_resources=reused)
                    cwd = harness.foreign if reused else (harness.project / script).parent
                    result = harness.run_setup(script, cwd, reuse_cluster=reused)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    identifier = REUSED_CLUSTER if reused else NEW_CLUSTER
                    endpoint = f"{identifier}.dsql.{REGION}.on.aws"
                    create, = harness.calls("aws", ("lambda", "create-function"))
                    self.assertEqual(argument(create, "--role"), ROLE_ARN)
                    self.assertEqual(argument(create, "--environment"),
                                     f"Variables={{DSQL_ENDPOINT={endpoint},DSQL_USER=app_readonly,RUST_LOG=info}}")
                    policy, = harness.calls("aws", ("iam", "put-role-policy"))
                    self.assertEqual(policy["--policy-document"], {
                        "Version": "2012-10-17", "Statement": [{
                            "Effect": "Allow", "Action": "dsql:DbConnect",
                            "Resource": f"arn:aws:dsql:{REGION}:{ACCOUNT}:cluster/{identifier}",
                        }],
                    })
                    api_line, = [line for line in result.stdout.splitlines() if "API Endpoint:" in line]
                    self.assertEqual(api_line.split("API Endpoint:", 1)[1].strip(), API_ENDPOINT + "/lookup")
                    seed_steps = result.stdout.split("  1. Seed", 1)[1].split("  2. Test", 1)[0]
                    seed_commands = "\n".join(line.strip() for line in seed_steps.splitlines()[1:])
                    self.assertIn("TOKEN=", seed_commands)
                    seed = subprocess.run(["bash", "-e", "-c", seed_commands], cwd=cwd,
                                          env=harness.env, text=True, capture_output=True, timeout=10)
                    self.assertEqual(seed.returncode, 0, seed.stdout + seed.stderr)
                    token, = harness.calls("aws", ("dsql", "generate-db-connect-admin-auth-token"))
                    self.assertEqual(argument(token, "--hostname"), endpoint)
                    self.assertEqual(argument(token, "--region"), REGION)
                    psql, = harness.calls("psql")
                    self.assertIn(f"host={endpoint} port=5432 dbname=postgres user=admin sslmode=require", psql["args"])
                    self.assertIn("ON_ERROR_STOP=1", psql["args"])
                    self.assertIn(f"role_arn={ROLE_ARN}", psql["args"])
                    self.assertEqual(psql["password"], "offline-admin-token")
                    self.assertEqual((cwd / argument(psql, "-f")).resolve(), harness.project / "seed.sql")
                    self.assertEqual(bool(harness.calls("aws", ("dsql", "create-cluster"))), not reused)
                    cleanup = [shlex.split(line.strip()) for line in result.stdout.splitlines() if line.strip().startswith("aws ")]
                    cluster_cleanup = [cmd for cmd in cleanup if cmd[:3] == ["aws", "dsql", "delete-cluster"]]
                    expected = ["aws", "dsql", "delete-cluster", "--identifier", identifier, "--region", REGION]
                    self.assertEqual(cluster_cleanup, [] if reused else [expected])

    def test_http_stage_has_demo_throttling(self):
        # Removing or misnaming the CLI setting deploys an unthrottled API.
        for script in SETUP_SCRIPTS:
            with self.subTest(script=script), ScriptHarness() as harness:
                result = harness.run_setup(script, harness.foreign, reuse_cluster=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                stage, = harness.calls("aws", ("apigatewayv2", "create-stage"))
                self.assertEqual(argument(stage, "--stage-name"), "$default")
                self.assertIn("--auto-deploy", stage["args"])
                self.assertEqual(argument(stage, "--region"), REGION)
                self.assertIn("--default-route-settings", stage["args"])
                value = argument(stage, "--default-route-settings")
                settings = json.loads(value) if value.startswith("{") else dict(item.split("=", 1) for item in value.split(","))
                self.assertEqual(int(settings["ThrottlingBurstLimit"]), 10)
                self.assertEqual(float(settings["ThrottlingRateLimit"]), 5)

    def test_log_retention_and_teardown_respect_resource_ownership(self):
        # Using another resource's ownership flag, ignoring an existing log
        # group, or omitting the region can delete logs that this run did not own.
        for script in SETUP_SCRIPTS:
            for existing_logs in (False, True):
                with self.subTest(script=script, existing_logs=existing_logs), ScriptHarness() as harness:
                    reuse_resources = not existing_logs
                    harness.configure(reuse_resources=reuse_resources, existing_logs=existing_logs)
                    result = harness.run_setup(script, harness.foreign, reuse_cluster=True)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    log_create = harness.calls("aws", ("logs", "create-log-group"))
                    self.assertEqual(len(log_create), 1)
                    retention, = harness.calls("aws", ("logs", "put-retention-policy"))
                    for call in (*log_create, retention):
                        self.assertEqual(argument(call, "--log-group-name"), f"/aws/lambda/{FUNCTION}")
                        self.assertEqual(argument(call, "--region"), REGION)
                    self.assertEqual(argument(retention, "--retention-in-days"), "7")
                    calls = harness.calls("aws")
                    self.assertLess(calls.index(log_create[0]), calls.index(harness.calls("aws", ("lambda", "create-function"))[0]))
                    cleanup = [shlex.split(line.strip()) for line in result.stdout.splitlines() if line.strip().startswith("aws ")]
                    log_cleanup = [cmd for cmd in cleanup if cmd[:3] == ["aws", "logs", "delete-log-group"]]
                    expected = ["aws", "logs", "delete-log-group", "--log-group-name", f"/aws/lambda/{FUNCTION}", "--region", REGION]
                    self.assertEqual(log_cleanup, [] if existing_logs else [expected])
                    self.assertFalse(any(cmd[:3] == ["aws", "dsql", "delete-cluster"] for cmd in cleanup))
                    role_cleanup = [cmd for cmd in cleanup if cmd[:3] == ["aws", "iam", "delete-role"]]
                    self.assertEqual(bool(role_cleanup), not reuse_resources)
                    ecr_cleanup = [cmd for cmd in cleanup if cmd[:3] == ["aws", "ecr", "delete-repository"]]
                    self.assertEqual(bool(ecr_cleanup), not reuse_resources and "/zip/" not in script)
                    self.assertFalse(harness.calls("aws", ("logs", "delete-log-group")))

    def test_log_errors_stop_deployment_instead_of_claiming_success(self):
        # Treating every create error as "already exists", or suppressing a
        # retention error, hides missing permission and leaves unlimited logs.
        for script in SETUP_SCRIPTS:
            for operation in ("create-log-group", "put-retention-policy"):
                with self.subTest(script=script, operation=operation), ScriptHarness() as harness:
                    harness.configure(fail_command=["logs", operation])
                    result = harness.run_setup(script, harness.foreign, reuse_cluster=True)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("AccessDeniedException", result.stderr)
                    self.assertNotIn("SETUP COMPLETE!", result.stdout)
                    self.assertFalse(harness.calls("aws", ("lambda", "create-function")))

    def test_iam_policy_error_stops_deployment_and_cleans_private_files(self):
        # Suppressing the DSQL policy error creates a nonfunctional Lambda;
        # removing failure cleanup leaks its per-run policy documents.
        for script in SETUP_SCRIPTS:
            with self.subTest(script=script), ScriptHarness() as harness:
                harness.configure(fail_command=["iam", "put-role-policy"])
                result = harness.run_setup(script, harness.foreign, reuse_cluster=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("AccessDenied", result.stderr)
                self.assertNotIn("SETUP COMPLETE!", result.stdout)
                self.assertFalse(harness.calls("aws", ("lambda", "create-function")))
                self.assertEqual(list(harness.tmp.iterdir()), [])


class ApiScriptTests(unittest.TestCase):
    def assert_success(self, harness, result, url):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("All tests passed!", result.stdout)
        self.assertIn(f"API URL: {url}", result.stdout)
        calls = harness.calls("curl")
        self.assertEqual(len(calls), 6)
        for call in calls:
            self.assertEqual(argument(call, "-X"), "POST")
            self.assertEqual(call["args"][call["args"].index("-X") + 2], url)
            self.assertEqual(argument(call, "-H"), "Content-Type: application/json")
        self.assertFalse(harness.calls("aws"))

    def assert_failure_summary(self, harness, result):
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn(">>> Test 6:", result.stdout)
        self.assertRegex(result.stdout, r"[1-9][0-9]* test\(s\) failed")
        self.assertEqual(len(harness.calls("curl")), 6)
        self.assertFalse(harness.calls("aws"))

    def test_api_url_takes_precedence_over_legacy_endpoint_and_sidecar(self):
        # Overwriting API_URL with API_ENDPOINT hits the wrong deployed API.
        with ScriptHarness() as harness:
            (harness.project / "env.sh").write_text('export API_URL="https://saved.example/lookup"\n')
            url = "https://canonical.example/prod/lookup"
            result = harness.run_api(API_URL=url, API_ENDPOINT="https://legacy.example")
            self.assert_success(harness, result, url)

    def test_api_url_alone_accepts_full_lookup_url_and_trailing_slash(self):
        # Requiring API_ENDPOINT rejects the README's API_URL contract;
        # unconditional appending creates /lookup/lookup or /lookup//lookup.
        for url in (API_ENDPOINT + "/lookup", API_ENDPOINT + "/lookup/"):
            with self.subTest(url=url), ScriptHarness() as harness:
                result = harness.run_api(API_URL=url)
                self.assert_success(harness, result, API_ENDPOINT + "/lookup")

    def test_legacy_endpoint_accepts_base_and_full_lookup_url(self):
        for suffix in ("", "/", "/lookup", "/lookup/"):
            with self.subTest(suffix=suffix), ScriptHarness() as harness:
                result = harness.run_api(API_ENDPOINT=API_ENDPOINT + suffix)
                self.assert_success(harness, result, API_ENDPOINT + "/lookup")

    def test_sidecar_is_loaded_next_to_script_not_from_caller_directory(self):
        # A caller-relative source reads a different deployment's environment.
        for variable in ("API_URL", "API_ENDPOINT"):
            with self.subTest(variable=variable), ScriptHarness() as harness:
                (harness.project / "env.sh").write_text(f'export {variable}="{API_ENDPOINT}/lookup"\n')
                (harness.foreign / "env.sh").write_text('export API_ENDPOINT="https://wrong.example"\n')
                result = harness.run_api()
                self.assert_success(harness, result, API_ENDPOINT + "/lookup")

    def test_macos_saved_environment_exports_deployment_outputs(self):
        # Saving env.sh in the caller's directory or omitting the canonical URL
        # or deployed role ARN breaks subsequent source/test/seed commands.
        for script in SETUP_SCRIPTS[2:]:
            with self.subTest(script=script), ScriptHarness() as harness:
                setup = harness.run_setup(script, harness.foreign, reuse_cluster=True)
                self.assertEqual(setup.returncode, 0, setup.stdout + setup.stderr)
                source = subprocess.run(
                    ["bash", "-eu", "-c", 'source "$1"; printf "%s\\n" "$API_URL" "$ROLE_ARN" "$CLUSTER_ENDPOINT"',
                     "saved-env", str(harness.project / "env.sh")],
                    cwd=harness.foreign, env=harness.env, text=True, capture_output=True, timeout=10,
                )
                self.assertEqual(source.returncode, 0, source.stdout + source.stderr)
                self.assertEqual(source.stdout.splitlines(), [API_ENDPOINT + "/lookup", ROLE_ARN,
                                                              f"{REUSED_CLUSTER}.dsql.{REGION}.on.aws"])
                harness.log.write_text("")
                result = harness.run_api()
                self.assert_success(harness, result, API_ENDPOINT + "/lookup")

    def test_environment_legacy_endpoint_overrides_saved_api_url(self):
        # Sourcing env.sh unconditionally overrides an explicit deployment.
        with ScriptHarness() as harness:
            (harness.project / "env.sh").write_text('export API_URL="https://saved.example/lookup"\n')
            result = harness.run_api(API_ENDPOINT=API_ENDPOINT)
            self.assert_success(harness, result, API_ENDPOINT + "/lookup")

    def test_missing_url_fails_before_any_request(self):
        with ScriptHarness() as harness:
            result = harness.run_api()
            self.assertEqual(result.returncode, 1)
            self.assertIn("API_URL", result.stdout)
            self.assertIn("API_ENDPOINT", result.stdout)
            self.assertEqual(harness.calls(), [])
            self.assertEqual(list(harness.tmp.iterdir()), [])

    def test_non_json_and_invalid_count_responses_reach_failure_summary(self):
        # Unguarded jq under set -e exits on HTML/arrays before later tests or
        # the summary. Missing/invalid counts must not become a false success.
        for status, body in (("502", "<html>Proxy error</html>"), ("200", "not JSON"),
                             ("200", "[]"), ("200", '{"count": null}'),
                             ("200", '{"count": "invalid"}')):
            with self.subTest(status=status, body=body), ScriptHarness() as harness:
                harness.configure(curl_responses={"{}": {"status": status, "body": body}})
                result = harness.run_api(API_ENDPOINT=API_ENDPOINT)
                self.assert_failure_summary(harness, result)
                self.assertIn("Expected count > 0", result.stdout)

    def test_http_and_json_field_errors_produce_nonzero_summary(self):
        # Ignoring either status checks or field checks incorrectly returns 0.
        for data, response in (
            ('{"name": "John"}', {"status": "500"}),
            ('{"name": "alice"}', {"body": '{"count":1,"employees":[{"name":"Wrong employee"}]}'}),
            ("not valid json", {"body": '{"error":"Wrong error"}'}),
        ):
            with self.subTest(data=data), ScriptHarness() as harness:
                harness.configure(curl_responses={data: response})
                result = harness.run_api(API_ENDPOINT=API_ENDPOINT)
                self.assert_failure_summary(harness, result)

    def test_curl_connection_failure_reaches_summary(self):
        # A nonzero curl assignment under set -e otherwise aborts immediately.
        requests = ("{}", '{"name": "John"}', '{"name": "alice"}', '{"name": "zzz"}', "", "not valid json")
        for index, data in enumerate(requests, 1):
            with self.subTest(data=data), ScriptHarness() as harness:
                harness.configure(curl_responses={data: {"status": "000", "body": "", "exit_code": 7}})
                result = harness.run_api(API_ENDPOINT=API_ENDPOINT)
                self.assert_failure_summary(harness, result)
                self.assertIn("HTTP 000", result.stdout)
                failed_test = result.stdout.split(f">>> Test {index}:", 1)[1].split(">>> Test", 1)[0]
                self.assertNotIn('"employees"', failed_test)  # No stale response from the previous request.

    def test_response_files_are_per_run_and_cleaned_on_success_and_failure(self):
        # Fixed /tmp/response.json collides between invocations; a missing trap
        # leaves response bodies behind on either successful or failing runs.
        with ScriptHarness() as harness:
            previous_paths = set()
            for fail in (False, True):
                harness.configure(curl_responses={"{}": {"body": "not JSON"}} if fail else {})
                result = harness.run_api(API_ENDPOINT=API_ENDPOINT)
                if fail:
                    self.assert_failure_summary(harness, result)
                else:
                    self.assert_success(harness, result, API_ENDPOINT + "/lookup")
                paths = {Path(argument(call, "-o")) for call in harness.calls("curl")}
                self.assertTrue(paths)
                self.assertFalse(previous_paths & paths)
                for path in paths:
                    self.assertIn(harness.tmp, path.parents)
                    self.assertFalse(path.exists(), path)
                previous_paths.update(paths)


if __name__ == "__main__":
    unittest.main()
