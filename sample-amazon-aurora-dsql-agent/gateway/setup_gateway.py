"""
Provision the Bedrock AgentCore Gateway for grid investigation tools.

Creates:
  1. Cognito OAuth authorizer (ingress auth)
  2. Gateway IAM role (with bedrock-agentcore.amazonaws.com trust)
  3. Lambda IAM role + deploys the Lambda function
  4. Gateway + Lambda target with tool schemas
  5. Saves config to gateway_config.json

Usage:
    python setup_gateway.py \
        --account-id 123456789012 \
        --region us-east-1 \
        --dsql-endpoint <cluster-id>.dsql.us-east-1.on.aws \
        --lambda-file ../lambda/grid_tools/handler.py

    # Or if roles/Lambda already exist:
    python setup_gateway.py \
        --account-id 123456789012 \
        --region us-east-1 \
        --lambda-arn arn:aws:lambda:us-east-1:123456789012:function:grid-investigation-tools \
        --gateway-role-arn arn:aws:iam::123456789012:role/grid-investigation-gateway-role
"""

import argparse
import json
import os
import time
import io
import zipfile

import boto3
from bedrock_agentcore_starter_toolkit.operations.gateway.client import GatewayClient

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

GATEWAY_NAME = "grid-investigation-gateway"
LAMBDA_NAME = "grid-investigation-tools"
LAMBDA_ROLE_NAME = "grid-investigation-lambda-role"
GATEWAY_ROLE_NAME = "grid-investigation-gateway-role"

# ---------------------------------------------------------------------------
# Tool schemas (MCP tool definitions exposed through the Gateway)
# ---------------------------------------------------------------------------

TOOL_SCHEMAS = [
    {
        "name": "query_grid_database",
        "description": (
            "Execute a parameterized read-only SQL query against the grid operations "
            "Aurora DSQL database. The agent generates the SQL with %s placeholders "
            "and passes parameter values separately. Only SELECT queries are allowed. "
            "Tables: grid_incidents, feeder_events, switching_events, "
            "transformer_inspections, incident_weather, maintenance_log. "
            "Results are capped at 500 rows."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": (
                        "SQL SELECT query with %s placeholders for parameters. "
                        "Example: 'SELECT * FROM feeder_events WHERE feeder_id = %s "
                        "AND recorded_at BETWEEN %s AND %s ORDER BY recorded_at LIMIT 100'"
                    ),
                },
                "parameters": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": (
                        "Array of parameter values matching the %s placeholders in the SQL. "
                        "Example: ['F324', '2024-01-15T14:10:00Z', '2024-01-15T14:20:00Z']"
                    ),
                },
            },
            "required": ["sql"],
            "description": "Parameters for query_grid_database",
        },
    },
    {
        "name": "get_schema",
        "description": (
            "Retrieve the live database schema from DSQL's information_schema. "
            "Returns table names, column names, data types, and nullability for all "
            "grid investigation tables. Use this if you need to verify column names "
            "or types before generating a query."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {},
            "description": "No parameters required",
        },
    },
]


# ---------------------------------------------------------------------------
# IAM helpers
# ---------------------------------------------------------------------------

def create_lambda_role(iam, account_id: str, region: str, dsql_endpoint: str) -> str:
    """Create the Lambda execution role with DSQL + CloudWatch permissions."""
    trust = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "lambda.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    }

    try:
        resp = iam.create_role(
            RoleName=LAMBDA_ROLE_NAME,
            AssumeRolePolicyDocument=json.dumps(trust),
            Description="Lambda role for grid investigation MCP tools",
        )
        arn = resp["Role"]["Arn"]
        print(f"  Created Lambda role: {arn}")
    except iam.exceptions.EntityAlreadyExistsException:
        arn = f"arn:aws:iam::{account_id}:role/{LAMBDA_ROLE_NAME}"
        print(f"  Lambda role exists: {arn}")

    # Attach basic execution (CloudWatch logs)
    iam.attach_role_policy(
        RoleName=LAMBDA_ROLE_NAME,
        PolicyArn="arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    )

    # Inline policy: DSQL connect
    iam.put_role_policy(
        RoleName=LAMBDA_ROLE_NAME,
        PolicyName="DSQLAccess",
        PolicyDocument=json.dumps({
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Action": ["dsql:DbConnectAdmin", "dsql:DbConnect"],
                "Resource": "arn:aws:dsql:*:*:cluster/*",
            }],
        }),
    )

    return arn


def create_gateway_role(iam, account_id: str, region: str) -> str:
    """Create the Gateway execution role with Lambda invoke permission.

    CRITICAL: trust policy must be exactly this — no extra Condition blocks.
    """
    trust = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "bedrock-agentcore.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    }

    try:
        resp = iam.create_role(
            RoleName=GATEWAY_ROLE_NAME,
            AssumeRolePolicyDocument=json.dumps(trust),
            Description="Gateway role for AgentCore grid investigation",
        )
        arn = resp["Role"]["Arn"]
        print(f"  Created Gateway role: {arn}")
    except iam.exceptions.EntityAlreadyExistsException:
        arn = f"arn:aws:iam::{account_id}:role/{GATEWAY_ROLE_NAME}"
        print(f"  Gateway role exists: {arn}")
        # Always reset trust policy to avoid stale Condition blocks
        iam.update_assume_role_policy(
            RoleName=GATEWAY_ROLE_NAME,
            PolicyDocument=json.dumps(trust),
        )
        print("  Reset Gateway role trust policy (removed any extra Condition blocks)")

    # Inline policy: invoke the Lambda
    iam.put_role_policy(
        RoleName=GATEWAY_ROLE_NAME,
        PolicyName="LambdaInvokeAccess",
        PolicyDocument=json.dumps({
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Action": "lambda:InvokeFunction",
                "Resource": f"arn:aws:lambda:{region}:{account_id}:function:{LAMBDA_NAME}",
            }],
        }),
    )

    return arn


# ---------------------------------------------------------------------------
# Lambda deploy helper
# ---------------------------------------------------------------------------

def deploy_lambda(session, region: str, role_arn: str, handler_file: str, dsql_endpoint: str) -> str:
    """Deploy (create or update) the grid-tools Lambda function."""
    lam = session.client("lambda", region_name=region)

    # Package code
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(handler_file, "handler.py")
    buf.seek(0)
    zip_bytes = buf.read()

    env_vars = {"DSQL_CLUSTER_ENDPOINT": dsql_endpoint}

    try:
        lam.get_function(FunctionName=LAMBDA_NAME)
        # Update existing
        lam.update_function_code(FunctionName=LAMBDA_NAME, ZipFile=zip_bytes)
        time.sleep(5)
        lam.update_function_configuration(
            FunctionName=LAMBDA_NAME,
            Environment={"Variables": env_vars},
        )
        print(f"  Updated Lambda: {LAMBDA_NAME}")
    except lam.exceptions.ResourceNotFoundException:
        # Create new — wait for IAM propagation
        print("  Waiting 10s for IAM role propagation...")
        time.sleep(10)
        lam.create_function(
            FunctionName=LAMBDA_NAME,
            Runtime="python3.12",
            Role=role_arn,
            Handler="handler.lambda_handler",
            Code={"ZipFile": zip_bytes},
            Timeout=30,
            MemorySize=512,
            Environment={"Variables": env_vars},
        )
        print(f"  Created Lambda: {LAMBDA_NAME}")

    # Allow AgentCore to invoke
    try:
        lam.add_permission(
            FunctionName=LAMBDA_NAME,
            StatementId="AllowAgentCoreInvoke",
            Action="lambda:InvokeFunction",
            Principal="bedrock-agentcore.amazonaws.com",
        )
        print("  Added AgentCore invoke permission on Lambda")
    except lam.exceptions.ResourceConflictException:
        pass  # already exists

    account_id = session.client("sts").get_caller_identity()["Account"]
    return f"arn:aws:lambda:{region}:{account_id}:function:{LAMBDA_NAME}"


# ---------------------------------------------------------------------------
# Main setup
# ---------------------------------------------------------------------------

def setup(args):
    session = boto3.Session(profile_name=args.profile, region_name=args.region)
    iam = session.client("iam")
    account_id = args.account_id

    # --- Step 1: IAM roles ---
    if args.gateway_role_arn:
        gateway_role_arn = args.gateway_role_arn
        print(f"Using existing Gateway role: {gateway_role_arn}")
    else:
        print("Step 1a: Creating Gateway IAM role...")
        gateway_role_arn = create_gateway_role(iam, account_id, args.region)

    if args.lambda_arn:
        lambda_arn = args.lambda_arn
        print(f"Using existing Lambda: {lambda_arn}")
    else:
        print("Step 1b: Creating Lambda IAM role...")
        lambda_role_arn = create_lambda_role(iam, account_id, args.region, args.dsql_endpoint)

        # --- Step 2: Deploy Lambda ---
        print("Step 2: Deploying Lambda...")
        lambda_arn = deploy_lambda(session, args.region, lambda_role_arn, args.lambda_file, args.dsql_endpoint)

    # --- Step 3: Create Gateway ---
    print("Step 3: Creating AgentCore Gateway...")
    client = GatewayClient(region_name=args.region)

    # Cognito OAuth authorizer (handles ingress auth to the Gateway)
    print("  Creating OAuth authorizer...")
    cognito_response = client.create_oauth_authorizer_with_cognito(GATEWAY_NAME)

    # Create the gateway
    print("  Creating gateway...")
    gateway = client.create_mcp_gateway(
        name=GATEWAY_NAME,
        role_arn=gateway_role_arn,
        authorizer_config=cognito_response["authorizer_config"],
        enable_semantic_search=True,
    )
    print(f"  Gateway ID: {gateway['gatewayId']}")
    print(f"  Gateway URL: {gateway['gatewayUrl']}")

    # Fix IAM — toolkit may add extra Condition blocks to the trust policy
    client.fix_iam_permissions(gateway)

    # Always reset trust policy to the clean version
    iam.update_assume_role_policy(
        RoleName=GATEWAY_ROLE_NAME if not args.gateway_role_arn else args.gateway_role_arn.split("/")[-1],
        PolicyDocument=json.dumps({
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"Service": "bedrock-agentcore.amazonaws.com"},
                "Action": "sts:AssumeRole",
            }],
        }),
    )
    print("  Verified Gateway role trust policy (clean, no extra Conditions)")

    print("  Waiting 30s for IAM propagation...")
    time.sleep(30)

    # --- Step 4: Add Lambda target with tool schemas ---
    print("Step 4: Adding Lambda target with tool schemas...")
    lambda_target = client.create_mcp_gateway_target(
        gateway=gateway,
        name="grid-tools",
        target_type="lambda",
        target_payload={
            "lambdaArn": lambda_arn,
            "toolSchema": {
                "inlinePayload": TOOL_SCHEMAS,
            },
        },
        credentials=None,
    )
    print(f"  Target ID: {lambda_target.get('targetId', 'OK')}")

    # --- Save config ---
    config = {
        "gateway_url": gateway["gatewayUrl"],
        "gateway_id": gateway["gatewayId"],
        "gateway_arn": gateway.get("gatewayArn", ""),
        "lambda_arn": lambda_arn,
        "region": args.region,
        "client_info": cognito_response["client_info"],
    }
    config_path = os.path.join(os.path.dirname(__file__), "gateway_config.json")
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)

    client_info = cognito_response["client_info"]
    print(f"\n{'='*60}")
    print("Gateway ready!")
    print(f"{'='*60}")
    print(f"Gateway URL:    {gateway['gatewayUrl']}")
    print(f"Gateway ID:     {gateway['gatewayId']}")
    print(f"Client ID:      {client_info['client_id']}")
    print(f"Client Secret:  {client_info['client_secret']}")
    print(f"Token Endpoint: {client_info['token_endpoint']}")
    print(f"Scope:          {client_info['scope']}")
    print(f"\nConfig saved to: {config_path}")
    print(f"\nExport for the agent:")
    print(f"  export GATEWAY_MCP_URL={gateway['gatewayUrl']}")
    print(f"  export GATEWAY_CLIENT_ID={client_info['client_id']}")
    print(f"  export GATEWAY_CLIENT_SECRET={client_info['client_secret']}")
    print(f"  export GATEWAY_TOKEN_ENDPOINT={client_info['token_endpoint']}")
    print(f"  export GATEWAY_SCOPE={client_info['scope']}")
    print(f"  export AWS_REGION={args.region}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Provision AgentCore Gateway for grid investigation tools")
    parser.add_argument("--account-id",       required=True, help="AWS account ID")
    parser.add_argument("--region",           default="us-east-1")
    parser.add_argument("--profile",          default=None, help="AWS CLI profile name")

    # If you want the script to create everything:
    parser.add_argument("--dsql-endpoint",    help="DSQL cluster endpoint, e.g. <id>.dsql.us-east-1.on.aws")
    parser.add_argument("--lambda-file",      help="Path to handler.py", default="../lambda/grid_tools/handler.py")

    # Or bring your own:
    parser.add_argument("--lambda-arn",       help="Existing Lambda ARN (skip Lambda creation)")
    parser.add_argument("--gateway-role-arn", help="Existing Gateway role ARN (skip role creation)")

    args = parser.parse_args()

    if not args.lambda_arn and not args.dsql_endpoint:
        parser.error("--dsql-endpoint is required when creating a new Lambda (no --lambda-arn provided)")

    setup(args)
