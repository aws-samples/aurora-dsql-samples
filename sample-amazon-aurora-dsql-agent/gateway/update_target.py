"""
Update the existing Gateway target with new tool schemas.
Replaces any existing tools with the dynamic query_grid_database + get_schema tools.

Uses the bedrock_agentcore_starter_toolkit GatewayClient (same as setup_gateway.py).

Usage:
    AWS_PROFILE=aws-dev-profile python update_target.py
"""

import json
import os

from bedrock_agentcore_starter_toolkit.operations.gateway.client import GatewayClient

# Load config
config_path = os.path.join(os.path.dirname(__file__), "gateway_config.json")
with open(config_path) as f:
    config = json.load(f)

GATEWAY_ID = config["gateway_id"]
LAMBDA_ARN = config["lambda_arn"]
REGION = config["region"]

NEW_TOOL_SCHEMAS = [
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


def main():
    client = GatewayClient(region_name=REGION)

    # List existing targets
    print(f"Listing targets for gateway: {GATEWAY_ID}")
    result = client.list_gateway_targets(GATEWAY_ID)
    items = result.get("items", [])
    print(f"Found {len(items)} targets")

    for target in items:
        target_id = target["targetId"]
        target_name = target.get("name", "unknown")
        print(f"  Deleting target: {target_name} ({target_id})")
        client.delete_gateway_target(
            gateway_identifier=GATEWAY_ID,
            target_id=target_id,
        )
        print(f"  Deleted.")

    # Recreate with new schemas
    print(f"\nCreating new target with dynamic SQL tools...")
    gw_response = client.get_gateway(GATEWAY_ID)
    gateway = gw_response["gateway"]  # inner dict has gatewayId, gatewayUrl, etc.
    lambda_target = client.create_mcp_gateway_target(
        gateway=gateway,
        name="grid-tools",
        target_type="lambda",
        target_payload={
            "lambdaArn": LAMBDA_ARN,
            "toolSchema": {
                "inlinePayload": NEW_TOOL_SCHEMAS,
            },
        },
        credentials=None,
    )
    print(f"Created target: {lambda_target.get('targetId', 'OK')}")
    print("Done — Gateway now exposes query_grid_database + get_schema tools.")


if __name__ == "__main__":
    main()
