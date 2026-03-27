"""
AWS Lambda function for Bedrock AgentCore Gateway.
Provides a single dynamic SQL execution tool backed by Aurora DSQL.

The agent generates parameterized SQL based on schema context in its system prompt.
This Lambda validates and executes the SQL safely.

Tool routing:
  - Gateway invocation: tool name from context.client_context.custom["bedrockAgentCoreToolName"]
    with "___" (triple underscore) delimiter — everything after the delimiter is the tool name.
  - Direct test invocation: tool name from event["tool_name"]

Environment variables:
  DSQL_CLUSTER_ENDPOINT  – e.g. <id>.dsql.us-east-1.on.aws
  AWS_REGION             – set automatically by Lambda runtime
"""

import json
import os
import re
import logging
from datetime import datetime
from typing import Any, Dict

import aurora_dsql_psycopg2 as dsql

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CLUSTER_ENDPOINT = os.environ["DSQL_CLUSTER_ENDPOINT"]
REGION = os.environ.get("AWS_REGION", "us-east-1")

# Maximum rows to return to prevent runaway queries
MAX_ROWS = 500

# Allowed tables — must match the schema deployed to DSQL
ALLOWED_TABLES = {
    "grid_incidents",
    "feeder_events",
    "switching_events",
    "transformer_inspections",
    "incident_weather",
    "maintenance_log",
}

# SQL statements that are never allowed
FORBIDDEN_PATTERNS = [
    re.compile(r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b", re.IGNORECASE),
    re.compile(r";\s*\S", re.IGNORECASE),  # multiple statements
]


# ---------------------------------------------------------------------------
# Connection helper
# ---------------------------------------------------------------------------

def _get_conn():
    """Open a short-lived DSQL connection using IAM auth."""
    return dsql.connect(
        host=CLUSTER_ENDPOINT,
        region=REGION,
        user="admin",
        dbname="postgres",
    )


def _rows_to_dicts(cursor) -> list[dict]:
    cols = [d[0] for d in cursor.description]
    return [dict(zip(cols, row)) for row in cursor.fetchall()]


def _serialize(obj: Any) -> Any:
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


# ---------------------------------------------------------------------------
# SQL validation
# ---------------------------------------------------------------------------

def validate_sql(sql: str) -> None:
    """
    Reject anything that isn't a read-only SELECT.
    Raises ValueError on violations.
    """
    stripped = sql.strip().rstrip(";").strip()

    # Must start with SELECT or WITH (for CTEs)
    if not re.match(r"^\s*(SELECT|WITH)\b", stripped, re.IGNORECASE):
        raise ValueError("Only SELECT queries (including WITH/CTE) are allowed.")

    for pattern in FORBIDDEN_PATTERNS:
        if pattern.search(stripped):
            raise ValueError(
                f"Forbidden SQL operation detected. Only read-only SELECT queries are allowed."
            )

    # Check that referenced tables are in the allowed set
    # Extract table names from FROM and JOIN clauses
    table_refs = re.findall(
        r"\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)\b", stripped, re.IGNORECASE
    )
    for table in table_refs:
        if table.lower() not in ALLOWED_TABLES:
            raise ValueError(
                f"Table '{table}' is not in the allowed set: {sorted(ALLOWED_TABLES)}"
            )


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

def query_grid_database(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute a parameterized read-only SQL query against the grid DSQL database.

    Expected event keys:
      - sql: The SQL query with %s placeholders for parameters
      - parameters: JSON array of parameter values (optional, default [])
    """
    sql = event.get("sql", "").strip()
    parameters = event.get("parameters", [])

    if not sql:
        return {"error": "Missing required field: 'sql'"}

    # Ensure parameters is a list
    if isinstance(parameters, str):
        try:
            parameters = json.loads(parameters)
        except json.JSONDecodeError:
            parameters = [parameters]

    # Validate the SQL before execution
    try:
        validate_sql(sql)
    except ValueError as e:
        return {"error": f"SQL validation failed: {e}"}

    # Append LIMIT if not already present to prevent huge result sets
    if not re.search(r"\bLIMIT\b", sql, re.IGNORECASE):
        sql = sql.rstrip().rstrip(";") + f" LIMIT {MAX_ROWS}"

    try:
        with _get_conn() as conn, conn.cursor() as cur:
            cur.execute(sql, tuple(parameters))
            rows = _rows_to_dicts(cur)
            return {
                "row_count": len(rows),
                "rows": rows,
                "truncated": len(rows) >= MAX_ROWS,
            }
    except Exception as exc:
        logger.exception("Query execution failed")
        return {"error": f"Query execution failed: {exc}"}


def get_schema(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Return the live database schema from DSQL's information_schema.
    Useful if the agent needs to refresh its understanding of the schema.
    """
    sql = """
        SELECT table_name, column_name, data_type, is_nullable,
               column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN %s
        ORDER BY table_name, ordinal_position
    """
    try:
        with _get_conn() as conn, conn.cursor() as cur:
            cur.execute(sql, (tuple(ALLOWED_TABLES),))
            rows = _rows_to_dicts(cur)

        # Group by table
        schema = {}
        for row in rows:
            table = row["table_name"]
            if table not in schema:
                schema[table] = []
            schema[table].append({
                "column": row["column_name"],
                "type": row["data_type"],
                "nullable": row["is_nullable"],
                "default": row["column_default"],
            })

        return {"tables": schema}
    except Exception as exc:
        logger.exception("Schema fetch failed")
        return {"error": f"Schema fetch failed: {exc}"}


# ---------------------------------------------------------------------------
# Tool dispatch
# ---------------------------------------------------------------------------

TOOLS = {
    "query_grid_database": query_grid_database,
    "get_schema": get_schema,
}


# ---------------------------------------------------------------------------
# Lambda entry point
# ---------------------------------------------------------------------------

def lambda_handler(event, context):
    """
    Routes to the correct tool function.

    Tool name source (priority order):
    1. context.client_context.custom["bedrockAgentCoreToolName"] (Gateway invocation)
    2. event["tool_name"] (direct test invocation)
    """
    logger.info("Event: %s", json.dumps(event, default=_serialize))

    tool_name = None

    # AgentCore Gateway invocation — tool name from context with ___ delimiter
    if hasattr(context, "client_context") and context.client_context:
        delimiter = "___"
        original = context.client_context.custom.get("bedrockAgentCoreToolName", "")
        if delimiter in original:
            tool_name = original[original.index(delimiter) + len(delimiter):]
        else:
            tool_name = original

    # Fallback: direct invocation for testing
    if not tool_name:
        tool_name = event.get("tool_name", "")

    handler = TOOLS.get(tool_name)
    if not handler:
        return {"error": f"Unknown tool: {tool_name}. Available: {list(TOOLS.keys())}"}

    try:
        result = handler(event)
        return json.loads(json.dumps(result, default=_serialize))
    except Exception as exc:
        logger.exception("Tool %s failed", tool_name)
        return {"error": str(exc)}
