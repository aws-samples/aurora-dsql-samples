"""
Smoke test for the deployed Grid Investigation Agent.

Sends canned questions via the App Agent's send_remote/send_local functions
and verifies responses are non-empty and mention expected feeders/data.

Usage:
  # Against deployed agent (AgentCore Runtime):
  python tests/smoke_test.py

  # Against local agent (localhost:9000):
  python tests/smoke_test.py --local

  # Verbose output:
  python tests/smoke_test.py -v
"""

import argparse
import sys
import os

# Add agent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "agent"))

from agent import load_config, get_runtime_url, send_remote, send_local


SMOKE_TESTS = [
    {
        "question": "How many incidents are in the database?",
        "expect_any": ["incident", "15", "grid_incidents"],
    },
    {
        "question": "What happened on feeder F324 on January 15th 2024?",
        "expect_any": ["F324", "voltage", "instability"],
    },
    {
        "question": "List all feeders that had outages in January 2024.",
        "expect_any": ["F324", "F112", "outage"],
    },
]


def run_smoke_tests(local: bool, verbose: bool) -> bool:
    if not local:
        config = load_config()
        region = config.get("region", "us-east-1")
        runtime_url = get_runtime_url(config, region)

    passed = 0
    failed = 0

    for i, test in enumerate(SMOKE_TESTS, 1):
        question = test["question"]
        expect_any = test["expect_any"]

        print(f"\n[{i}/{len(SMOKE_TESTS)}] {question}")

        try:
            if local:
                result = send_local(question)
            else:
                result = send_remote(question, runtime_url, region)

            if not result or not result.strip():
                print(f"  FAIL: Empty response")
                failed += 1
                continue

            if verbose:
                print(f"  Response ({len(result)} chars): {result[:200]}...")

            # Check that at least one expected term appears in the response
            found = [term for term in expect_any if term.lower() in result.lower()]
            if found:
                print(f"  PASS: Found expected terms: {found}")
                passed += 1
            else:
                print(f"  FAIL: None of {expect_any} found in response")
                failed += 1

        except Exception as exc:
            print(f"  FAIL: {exc}")
            failed += 1

    print(f"\n{'='*40}")
    print(f"Results: {passed} passed, {failed} failed out of {len(SMOKE_TESTS)}")
    return failed == 0


def main():
    parser = argparse.ArgumentParser(description="Smoke test for the Grid Investigation Agent")
    parser.add_argument("--local", action="store_true", help="Test against local agent on localhost:9000")
    parser.add_argument("-v", "--verbose", action="store_true", help="Print response excerpts")
    args = parser.parse_args()

    success = run_smoke_tests(local=args.local, verbose=args.verbose)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
