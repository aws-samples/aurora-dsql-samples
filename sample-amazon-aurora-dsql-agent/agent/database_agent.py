"""
Database Agent — A2A Server that connects to AgentCore Gateway via MCP.

Fetches the live database schema dynamically at startup via the `get_schema` MCP tool,
then serves A2A requests as a long-lived FastAPI/uvicorn process on port 9000.

The Database Agent owns the ENTIRE investigation workflow: it queries all tables,
correlates data, and produces root-cause analyses. The App Agent is a thin relay.

Local usage:
  python database_agent.py [--region us-east-1] [--config ../gateway/gateway_config.json]

For AgentCore Runtime deployment:
  agentcore configure -e agent/database_agent.py --protocol A2A
  agentcore launch
"""

import argparse
import json
import logging
import os
import signal
import sys
import time

import uvicorn
from fastapi import FastAPI
from strands import Agent
from strands.models import BedrockModel
from strands.multiagent.a2a import A2AServer
from strands.tools.mcp.mcp_client import MCPClient
from mcp.client.streamable_http import streamablehttp_client
from bedrock_agentcore_starter_toolkit.operations.gateway.client import GatewayClient

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# Reconnection constants
RECONNECT_BASE_DELAY = 1  # seconds
RECONNECT_MAX_DELAY = 30  # seconds
RECONNECT_MAX_RETRIES = 5

# Model configuration
MODEL_ID = "global.anthropic.claude-sonnet-4-6"

# A2A server defaults
A2A_HOST = "0.0.0.0"
A2A_PORT = 9000


SYSTEM_PROMPT_TEMPLATE = """You are a grid operations investigation assistant with access to an Aurora DSQL
database containing electrical distribution network operational data.

You have two tools:
- query_grid_database: Executes parameterized SQL against the database.
- get_schema: Returns the live database schema (use if you need to verify columns).

You decide WHAT to query based on the operator's question, generate the SQL with
%s placeholders, and pass parameter values separately.

## DATABASE SCHEMA (fetched live from Aurora DSQL)

{schema}

## KEY RELATIONSHIPS (no formal FKs in DSQL, but join on these)
- All tables share feeder_id as the common join key
- grid_incidents.started_at / resolved_at define incident time windows
- feeder_events.recorded_at, switching_events.switched_at, transformer_inspections.inspected_at,
  incident_weather.recorded_at, maintenance_log.scheduled_at/completed_at are the time columns
- To correlate data during an incident, join on feeder_id and filter where the event timestamp
  falls between started_at and COALESCE(resolved_at, NOW())

## SQL GENERATION RULES
1. Always use parameterized queries with %s placeholders. Pass values in the "parameters" array.
2. Only SELECT queries are allowed — no INSERT, UPDATE, DELETE, DDL.
3. Only reference tables listed in the schema above.
4. Always include a LIMIT clause (max 500) to prevent huge result sets.
5. Use TIMESTAMPTZ literals in ISO-8601 format for time parameters.
6. When investigating an incident, query multiple tables to correlate:
   - Start with grid_incidents to find the incident window
   - Then query feeder_events, switching_events, weather, transformer, maintenance
   - Use the incident time window to scope all related queries
7. For maintenance history, use interval arithmetic: NOW() - INTERVAL 'N days'

## INVESTIGATION WORKFLOW
When a grid operator asks about an incident or anomaly:
1. Identify the feeder ID and time window from the question
2. Query grid_incidents first to find matching incidents
3. Query feeder_events for sensor anomalies in that window
4. Query switching_events for any switching activity
5. Query incident_weather for environmental factors
6. Query transformer_inspections for equipment status
7. Query maintenance_log for recent work that might be related
8. Correlate all findings and produce a root-cause analysis with:
   - Timeline of events
   - Contributing factors (equipment, weather, switching, maintenance)
   - Root cause assessment
   - Recommended corrective actions

Always use ISO-8601 UTC timestamps (e.g. 2024-01-15T14:10:00Z).
If the operator gives a local time without a date, assume today's date.
"""


def load_config(config_path: str) -> dict:
    """Load gateway configuration from JSON file or Python config module."""
    # Try JSON file first (local development)
    if os.path.exists(config_path):
        with open(config_path) as f:
            return json.load(f)
    # Fall back to Python config module (AgentCore Runtime deployment)
    try:
        from gateway_config import GATEWAY_CONFIG
        return GATEWAY_CONFIG
    except ImportError:
        raise FileNotFoundError(f"Config not found at {config_path} or as gateway_config module")


def format_schema_for_prompt(schema_data: dict) -> str:
    """Format the live schema data from get_schema into a readable string for the system prompt."""
    if "error" in schema_data:
        raise RuntimeError(f"Schema fetch returned error: {schema_data['error']}")

    tables = schema_data.get("tables", {})
    if not tables:
        raise RuntimeError("Schema fetch returned no tables")

    lines = []
    for table_name, columns in sorted(tables.items()):
        lines.append(f"### {table_name}")
        lines.append("| Column | Type | Nullable | Default |")
        lines.append("|--------|------|----------|---------|")
        for col in columns:
            lines.append(
                f"| {col['column']} | {col['type']} | {col['nullable']} | {col.get('default', '')} |"
            )
        lines.append("")

    return "\n".join(lines)


def get_all_tools(mcp_client: MCPClient) -> list:
    """Fetch all tools from MCP with pagination."""
    tools = []
    pagination_token = None
    while True:
        page = mcp_client.list_tools_sync(pagination_token=pagination_token)
        tools.extend(page)
        if page.pagination_token is None:
            break
        pagination_token = page.pagination_token
    return tools


def get_oauth_token(config: dict, region: str) -> str:
    """Get OAuth access token via AgentCore toolkit."""
    gateway_client = GatewayClient(region_name=region)
    return gateway_client.get_access_token_for_cognito(config["client_info"])


def connect_mcp(config: dict, region: str) -> MCPClient:
    """Establish MCP connection to the AgentCore Gateway."""
    access_token = get_oauth_token(config, region)
    return MCPClient(
        lambda: streamablehttp_client(
            config["gateway_url"],
            headers={"Authorization": f"Bearer {access_token}"},
        )
    )


def reconnect_mcp(config: dict, region: str, old_client: MCPClient | None) -> MCPClient | None:
    """Attempt MCP reconnection with exponential backoff.

    Returns new MCPClient if successful, None if all retries exhausted.
    """
    delay = RECONNECT_BASE_DELAY
    for attempt in range(1, RECONNECT_MAX_RETRIES + 1):
        logger.warning(
            "MCP reconnection attempt %d/%d (delay: %.1fs)",
            attempt, RECONNECT_MAX_RETRIES, delay,
        )
        try:
            if old_client:
                try:
                    old_client.__exit__(None, None, None)
                except Exception:
                    pass

            new_client = connect_mcp(config, region)
            new_client.__enter__()
            tools = get_all_tools(new_client)
            logger.info(
                "MCP reconnection succeeded on attempt %d. Tools: %s",
                attempt, [t.tool_name for t in tools],
            )
            return new_client
        except Exception as exc:
            logger.error("MCP reconnection attempt %d failed: %s", attempt, exc)
            if attempt < RECONNECT_MAX_RETRIES:
                time.sleep(delay)
                delay = min(delay * 2, RECONNECT_MAX_DELAY)

    logger.critical(
        "MCP reconnection failed after %d attempts.", RECONNECT_MAX_RETRIES,
    )
    return None


def find_tool_name(tools: list, suffix: str) -> str:
    """Find the full MCP tool name that ends with the given suffix.

    Gateway-hosted tools are prefixed (e.g. 'grid-tools___get_schema').
    This helper resolves the actual name regardless of prefix.
    """
    for t in tools:
        name = t.tool_name if hasattr(t, "tool_name") else str(t)
        if name == suffix or name.endswith(f"___{suffix}"):
            return name
    raise RuntimeError(f"No MCP tool found matching '*{suffix}'. Available: {[t.tool_name for t in tools]}")


def fetch_schema(mcp_client: MCPClient, tools: list) -> str:
    """Fetch live schema via get_schema MCP tool and format for prompt."""
    tool_name = find_tool_name(tools, "get_schema")
    logger.info("Fetching live database schema via %s MCP tool...", tool_name)
    try:
        result = mcp_client.call_tool_sync(
            tool_use_id="schema-fetch-startup",
            name=tool_name,
            arguments={},
        )
        # result is a dict: {'status': 'success', 'content': [{'text': '...'}]}
        content = result.get("content", []) if isinstance(result, dict) else []
        for block in content:
            text = block.get("text") if isinstance(block, dict) else getattr(block, "text", None)
            if text:
                schema_data = json.loads(text)
                formatted = format_schema_for_prompt(schema_data)
                logger.info("Schema fetched successfully.")
                return formatted
        raise RuntimeError(f"{tool_name} returned no text content. Result: {result}")
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(f"Failed to fetch schema via {tool_name}: {exc}") from exc


def create_a2a_app(config: dict, region: str) -> FastAPI:
    """Create the FastAPI app with A2A server mounted.

    1. Establishes MCP connection to the AgentCore Gateway
    2. Fetches live schema via get_schema MCP tool
    3. Creates the Strands Agent with dynamic schema
    4. Wraps it in an A2AServer for A2A protocol support
    5. Mounts on a FastAPI app with health check

    Returns:
        FastAPI app ready to serve A2A requests.
    """
    gateway_url = config["gateway_url"]

    # Step 1: Establish MCP connection
    logger.info("Connecting to AgentCore Gateway via MCP at %s", gateway_url)
    mcp_client = connect_mcp(config, region)
    mcp_client.__enter__()

    # Step 2: Fetch tools and live schema
    tools = get_all_tools(mcp_client)
    logger.info("Available MCP tools: %s", [t.tool_name for t in tools])

    schema = fetch_schema(mcp_client, tools)

    # Step 3: Create the Strands Agent with dynamic schema
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(schema=schema)
    model = BedrockModel(model_id=MODEL_ID, region_name=region)
    strands_agent = Agent(
        name="Grid Database Agent",
        description=(
            "Grid Investigation Database Agent. Connects to Aurora DSQL via "
            "AgentCore Gateway MCP, generates parameterized SQL, queries grid "
            "operational data across 6 tables, correlates results, and produces "
            "root-cause analyses for electrical distribution network incidents."
        ),
        model=model,
        tools=tools,
        system_prompt=system_prompt,
    )
    logger.info("Database Agent created with dynamic schema and %d tools.", len(tools))

    # Step 4: Wrap in A2AServer
    # Use the AgentCore runtime URL if deployed, otherwise local
    runtime_url = os.environ.get(
        "AGENTCORE_RUNTIME_URL", f"http://127.0.0.1:{A2A_PORT}/"
    )
    logger.info("Runtime URL: %s", runtime_url)

    a2a_server = A2AServer(
        agent=strands_agent,
        http_url=runtime_url,
        serve_at_root=True,
    )

    # Step 5: Mount on FastAPI
    app = FastAPI()

    @app.get("/ping")
    def ping():
        return {"status": "healthy"}

    app.mount("/", a2a_server.to_fastapi_app())

    return app


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Grid Investigation Database Agent — A2A server via AgentCore Runtime."
    )
    parser.add_argument(
        "--region",
        default="us-east-1",
        help="AWS region for Bedrock and AgentCore Runtime (default: us-east-1)",
    )
    # Look for config in same directory first (AgentCore Runtime), then ../gateway/
    default_config = os.path.join(os.path.dirname(__file__), "gateway_config.json")
    if not os.path.exists(default_config):
        default_config = os.path.join(os.path.dirname(__file__), "..", "gateway", "gateway_config.json")
    parser.add_argument(
        "--config",
        default=default_config,
        help="Path to gateway_config.json",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=A2A_PORT,
        help=f"Port to serve on (default: {A2A_PORT})",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    logger.info("Loading config from %s", args.config)
    try:
        config = load_config(args.config)
    except FileNotFoundError as exc:
        logger.error("Config file not found: %s", exc)
        sys.exit(1)
    except json.JSONDecodeError as exc:
        logger.error("Invalid JSON in config file %s: %s", args.config, exc)
        sys.exit(1)

    region = config.get("region", args.region)

    try:
        app = create_a2a_app(config, region)
    except Exception as exc:
        logger.error("Failed to initialize Database Agent: %s", exc)
        sys.exit(1)

    logger.info("Starting A2A server on %s:%d", A2A_HOST, args.port)
    uvicorn.run(app, host=A2A_HOST, port=args.port)


if __name__ == "__main__":
    main()
