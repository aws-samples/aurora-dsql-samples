"""
Deploy the Grid Investigation Database Agent to Bedrock AgentCore Runtime.

Wraps the `agentcore` CLI commands for configuring and deploying the
Database Agent as an A2A server. Saves the resulting endpoint details
back to gateway/gateway_config.json under the `a2a` key.

Usage:
  # Configure + deploy:
  python register_database_agent.py --region us-east-1

  # Configure only (no deploy):
  python register_database_agent.py --configure-only

  # Deploy only (already configured):
  python register_database_agent.py --deploy-only
"""

import argparse
import json
import logging
import os
import subprocess
import sys

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

AGENT_NAME = "grid_database_agent"
AGENT_ENTRYPOINT = os.path.join(os.path.dirname(__file__), "database_agent.py")
CONFIG_PATH = os.path.join(
    os.path.dirname(__file__), "..", "gateway", "gateway_config.json"
)


def load_config(config_path: str) -> dict:
    with open(config_path) as f:
        return json.load(f)


def save_config(config: dict, config_path: str) -> None:
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)
        f.write("\n")


def run_cmd(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    """Run a shell command and log it."""
    logger.info("Running: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.stdout:
        logger.info("stdout: %s", result.stdout.strip())
    if result.stderr:
        logger.warning("stderr: %s", result.stderr.strip())
    if check and result.returncode != 0:
        logger.error("Command failed with exit code %d", result.returncode)
        sys.exit(result.returncode)
    return result


def configure_agent(region: str) -> None:
    """Run `agentcore configure` for A2A protocol deployment."""
    cmd = [
        "agentcore", "configure",
        "-e", AGENT_ENTRYPOINT,
        "-n", AGENT_NAME,
        "--protocol", "A2A",
        "--region", region,
        "--non-interactive",
    ]
    run_cmd(cmd)
    logger.info("Agent configured for A2A deployment.")


def deploy_agent() -> None:
    """Run `agentcore launch` to deploy the agent."""
    cmd = ["agentcore", "launch", "-a", AGENT_NAME, "--auto-update-on-conflict"]
    run_cmd(cmd)
    logger.info("Agent deployed to AgentCore Runtime.")


def get_agent_status() -> dict:
    """Run `agentcore status` and parse the output."""
    cmd = ["agentcore", "status", "-a", AGENT_NAME, "--verbose"]
    result = run_cmd(cmd, check=False)
    # The verbose output is JSON, but may have non-JSON text before it
    stdout = result.stdout.strip()
    # Try to find the JSON object in the output
    json_start = stdout.find("{")
    if json_start >= 0:
        try:
            # strict=False tolerates control characters in the JSON output
            decoder = json.JSONDecoder(strict=False)
            obj, _ = decoder.raw_decode(stdout, json_start)
            return obj
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
    return {"raw_output": stdout}


def update_config_with_endpoint(config: dict, region: str) -> dict:
    """Fetch agent status and update config with A2A endpoint details."""
    status = get_agent_status()

    # Try multiple paths to find the agent ARN
    agent_arn = (
        status.get("config", {}).get("agent_arn")
        or status.get("agent", {}).get("agentRuntimeArn")
        or ""
    )
    # Strip whitespace/newlines that may come from CLI output
    agent_arn = agent_arn.strip()

    if not agent_arn:
        logger.warning("Could not extract agent_arn from status output")

    endpoint_url = ""

    # Construct the endpoint URL from the ARN
    if agent_arn:
        from urllib.parse import quote
        escaped_arn = quote(agent_arn, safe="")
        endpoint_url = (
            f"https://bedrock-agentcore.{region}.amazonaws.com"
            f"/runtimes/{escaped_arn}/invocations/"
        )

    config["a2a"] = {
        "agent_name": AGENT_NAME,
        "agent_arn": agent_arn,
        "endpoint_url": endpoint_url,
    }
    return config


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Deploy the Grid Database Agent to AgentCore Runtime (A2A)."
    )
    parser.add_argument(
        "--region", default="us-east-1",
        help="AWS region (default: us-east-1)",
    )
    parser.add_argument(
        "--configure-only", action="store_true",
        help="Only run agentcore configure, skip deploy",
    )
    parser.add_argument(
        "--deploy-only", action="store_true",
        help="Only run agentcore launch, skip configure",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    # Load existing config
    logger.info("Loading config from %s", CONFIG_PATH)
    try:
        config = load_config(CONFIG_PATH)
    except FileNotFoundError:
        logger.error("Config file not found: %s. Run gateway/setup_gateway.py first.", CONFIG_PATH)
        sys.exit(1)

    region = config.get("region", args.region)

    # Configure
    if not args.deploy_only:
        configure_agent(region)

    # Deploy
    if not args.configure_only:
        # Write the Python config module BEFORE deploying so agentcore packages it.
        # The agent_arn will be empty on first deploy — the database agent doesn't need it.
        agent_config_py = os.path.join(os.path.dirname(__file__), "gateway_config.py")
        with open(agent_config_py, "w") as f:
            f.write("# Auto-generated by register_database_agent.py — do not edit manually.\n")
            f.write(f"GATEWAY_CONFIG = {json.dumps(config, indent=2)}\n")
        logger.info("Config module written to %s", agent_config_py)

        deploy_agent()

        # Update config with endpoint details (agent ARN)
        try:
            config = update_config_with_endpoint(config, region)
            save_config(config, CONFIG_PATH)
            logger.info("Config saved to %s", CONFIG_PATH)
        except Exception as exc:
            logger.warning("Could not auto-update config: %s", exc)
            logger.info("Run 'agentcore status -a %s --verbose' to get endpoint details.", AGENT_NAME)

    # Summary
    a2a = config.get("a2a", {})
    print(f"\n{'='*60}")
    print("Database Agent deployment complete!")
    print(f"{'='*60}")
    if a2a.get("agent_arn"):
        print(f"Agent Name:    {a2a.get('agent_name', AGENT_NAME)}")
        print(f"Agent ARN:     {a2a['agent_arn']}")
        print(f"Endpoint URL:  {a2a.get('endpoint_url', 'N/A')}")
    print(f"\nNext steps:")
    print(f"  Local test:    python agent/database_agent.py")
    print(f"  Then run:      python agent/agent.py \"your question\"")
    print(f"  Or curl:       curl -X POST http://localhost:9000 \\")
    print(f"                   -H 'Content-Type: application/json' \\")
    print(f"                   -d '{{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"method\":\"message/send\",...}}'")


if __name__ == "__main__":
    main()
