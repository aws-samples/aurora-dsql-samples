#!/usr/bin/env bash
#
# mint-token.sh
#
# Mint an Aurora DSQL IAM authentication token for the configured cluster
# and print it to stdout. Used by the other scripts via command substitution:
#
#   export FLYWAY_PASSWORD="$(bash scripts/mint-token.sh)"
#
# Required env:
#   AWS_REGION       - region of the DSQL cluster (default: us-east-1)
#   DSQL_ENDPOINT    - cluster endpoint hostname
#
# Why boto3 instead of AWS CLI:
#   - AWS CLI v1 (available via pip on Alpine) predates DSQL and does not
#     know the `dsql generate-db-connect-admin-auth-token` subcommand.
#   - AWS CLI v2 is distributed only as glibc binaries, which don't run
#     on Alpine's musl libc. boto3 ships pure Python and works everywhere.
#
# The token is valid for 15 minutes. A new one is minted for every
# invocation; the DSQL connector or Flyway treats it as the password.
set -euo pipefail

: "${DSQL_ENDPOINT:?DSQL_ENDPOINT must be set}"
AWS_REGION="${AWS_REGION:-us-east-1}"

python3 - <<PY
import os, sys
import boto3

region   = os.environ.get("AWS_REGION", "us-east-1")
hostname = os.environ["DSQL_ENDPOINT"]

client = boto3.client("dsql", region_name=region)
token  = client.generate_db_connect_admin_auth_token(Hostname=hostname)
sys.stdout.write(token)
PY
