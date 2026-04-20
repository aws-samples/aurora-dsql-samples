"""
Grid Investigation App Agent — Thin A2A relay.

Sends operator questions to the Database Agent's A2A server deployed on
AgentCore Runtime using SigV4-signed HTTP requests.

Usage:
  # Remote (AgentCore Runtime) — uses AWS credentials for SigV4 signing:
  python agent.py "How many incidents are in the database?"

  # Local (database_agent.py running on localhost:9000):
  python agent.py --local "How many incidents are in the database?"
"""

import argparse
import json
import logging
import os
import sys
from uuid import uuid4
from urllib.parse import quote

import boto3
import requests as req_lib
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

REQUEST_TIMEOUT = 300


def load_config() -> dict:
    """Load gateway config."""
    config_path = os.path.join(
        os.path.dirname(__file__), "..", "gateway", "gateway_config.json"
    )
    with open(config_path) as f:
        return json.load(f)


def get_runtime_url(config: dict, region: str) -> str:
    """Build the AgentCore Runtime invocation URL from the agent ARN."""
    agent_arn = config.get("a2a", {}).get("agent_arn", "")
    if not agent_arn:
        raise ValueError("No agent_arn in gateway_config.json. Deploy first or use --local.")
    escaped_arn = quote(agent_arn, safe="")
    return (
        f"https://bedrock-agentcore.{region}.amazonaws.com"
        f"/runtimes/{escaped_arn}/invocations/"
    )


def sigv4_request(method, url, region, body=None, session_id=None):
    """Make a SigV4-signed HTTP request to AgentCore Runtime."""
    session = boto3.Session(region_name=region)
    credentials = session.get_credentials().get_frozen_credentials()

    headers = {
        "Content-Type": "application/json",
        "Accept": "*/*",
    }
    if session_id:
        headers["X-Amzn-Bedrock-AgentCore-Runtime-Session-Id"] = session_id

    aws_request = AWSRequest(
        method=method,
        url=url,
        data=body or "",
        headers=headers,
    )
    SigV4Auth(credentials, "bedrock-agentcore", region).add_auth(aws_request)

    return req_lib.request(
        method=method,
        url=url,
        headers=dict(aws_request.headers),
        data=body or "",
        timeout=REQUEST_TIMEOUT,
    )


def build_a2a_payload(question):
    """Build an A2A JSON-RPC message/send payload."""
    return json.dumps({
        "jsonrpc": "2.0",
        "id": uuid4().hex,
        "method": "message/send",
        "params": {
            "message": {
                "kind": "message",
                "role": "user",
                "parts": [{"kind": "text", "text": question}],
                "messageId": uuid4().hex,
            }
        },
    })


def extract_a2a_text(body):
    """Extract text from A2A JSON-RPC response body."""
    texts = []
    result = body.get("result", {})
    for artifact in result.get("artifacts", []):
        for part in artifact.get("parts", []):
            if part.get("kind") == "text" and "text" in part:
                texts.append(part["text"])
    return "".join(texts) if texts else json.dumps(body, indent=2)


def send_remote(question, runtime_url, region):
    """Send question to the deployed DB Agent via SigV4-signed A2A JSON-RPC."""
    session_id = str(uuid4())
    logger.info("Runtime URL: %s", runtime_url)
    logger.info("Session ID: %s", session_id)

    payload = build_a2a_payload(question)
    logger.info("Sending A2A message/send via SigV4...")

    resp = sigv4_request("POST", runtime_url, region, body=payload, session_id=session_id)

    if resp.status_code != 200:
        raise RuntimeError(f"AgentCore returned {resp.status_code}: {resp.text[:500]}")

    return extract_a2a_text(resp.json())


def send_local(question, url="http://localhost:9000/"):
    """Send question to a local Database Agent via A2A JSON-RPC (no auth)."""
    payload = build_a2a_payload(question)
    logger.info("Sending A2A message/send to local agent at %s", url)

    resp = req_lib.post(url, data=payload, headers={"Content-Type": "application/json"},
                        timeout=REQUEST_TIMEOUT)

    if resp.status_code != 200:
        raise RuntimeError(f"Local agent returned {resp.status_code}: {resp.text[:500]}")

    return extract_a2a_text(resp.json())


def main():
    parser = argparse.ArgumentParser(
        description="Grid Investigation App Agent — sends questions to the Database Agent via A2A."
    )
    parser.add_argument(
        "question", nargs="*",
        default=["How many incidents are in the database?"],
        help="Question to ask the Database Agent",
    )
    parser.add_argument(
        "--local", action="store_true",
        help="Connect to local Database Agent on localhost:9000",
    )
    parser.add_argument(
        "--local-url", default="http://localhost:9000/",
        help="URL for local Database Agent (default: http://localhost:9000/)",
    )
    parser.add_argument(
        "--region", default=None,
        help="AWS region (default: from gateway_config.json)",
    )
    args = parser.parse_args()

    question = " ".join(args.question)
    print(f"Question: {question}\n")
    print("=" * 60)

    try:
        if args.local:
            result = send_local(question, args.local_url)
        else:
            config = load_config()
            region = args.region or config.get("region", "us-east-1")
            runtime_url = get_runtime_url(config, region)
            result = send_remote(question, runtime_url, region)

        print(result)
    except Exception as exc:
        logger.error("Failed: %s", exc, exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
