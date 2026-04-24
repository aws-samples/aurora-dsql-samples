"""
Unit tests for SQL validation in handler.py.

Run with:
  DSQL_CLUSTER_ENDPOINT=test.dsql.us-east-1.on.aws pytest test_handler.py -v
"""

import pytest
from handler import validate_sql, MAX_SQL_LENGTH


@pytest.mark.parametrize("sql", [
    "SELECT * FROM grid_incidents LIMIT 10",
    "SELECT feeder_id, COUNT(*) FROM feeder_events GROUP BY feeder_id LIMIT 50",
    "SELECT g.*, f.* FROM grid_incidents g JOIN feeder_events f ON g.feeder_id = f.feeder_id LIMIT 10",
    "SELECT * FROM switching_events WHERE feeder_id = %s LIMIT 100",
    "SELECT * FROM transformer_inspections JOIN incident_weather ON transformer_inspections.feeder_id = incident_weather.feeder_id LIMIT 50",
    "SELECT * FROM maintenance_log WHERE status = %s LIMIT 10",
])
def test_valid_queries(sql):
    validate_sql(sql)


# NOTE: WITH/CTE queries where the CTE alias appears in a FROM clause will be
# rejected by the table allowlist (the regex sees the alias as a table name).
# This is a known limitation of the regex-based approach. The primary security
# boundary is the DB-level enforcement via the non-admin 'grid_reader' role.
def test_cte_alias_rejected_known_limitation():
    """CTE aliases are caught by the table allowlist — known limitation."""
    with pytest.raises(ValueError, match="not in the allowed set"):
        validate_sql("WITH cte AS (SELECT * FROM grid_incidents) SELECT * FROM cte LIMIT 10")


@pytest.mark.parametrize("sql,reason", [
    ("INSERT INTO grid_incidents VALUES ('x')", "DML insert"),
    ("DROP TABLE grid_incidents", "DDL drop"),
    ("SELECT * FROM pg_catalog.pg_tables", "disallowed table"),
    ("SELECT * FROM grid_incidents; DROP TABLE grid_incidents", "multi-statement"),
    ("DELETE FROM grid_incidents WHERE 1=1", "DML delete"),
    ("SELECT * FROM users LIMIT 10", "disallowed table"),
    ("UPDATE grid_incidents SET severity = 'low'", "DML update"),
    ("TRUNCATE grid_incidents", "DDL truncate"),
    ("CREATE TABLE evil (id TEXT)", "DDL create"),
    ("ALTER TABLE grid_incidents ADD COLUMN x TEXT", "DDL alter"),
])
def test_rejected_queries(sql, reason):
    with pytest.raises(ValueError):
        validate_sql(sql)


# --- Tests for Finding 3: SQL validation bypass hardening ---

class TestCommentStripping:
    """Verify that SQL comments are stripped before validation."""

    def test_block_comment_stripped_leaves_valid_query(self):
        """Block comment containing DROP is stripped — remaining query is valid SELECT."""
        # After stripping: "SELECT  * FROM grid_incidents" — valid
        validate_sql("SELECT /* DROP TABLE grid_incidents */ * FROM grid_incidents")

    def test_line_comment_stripped_leaves_valid_query(self):
        """Line comment containing DELETE is stripped — remaining query is valid SELECT."""
        # After stripping: "SELECT * FROM grid_incidents " — valid
        validate_sql("SELECT * FROM grid_incidents -- DELETE FROM grid_incidents")

    def test_block_comment_cannot_hide_forbidden_table(self):
        """Stripping a block comment that hid the real FROM exposes the forbidden table."""
        with pytest.raises(ValueError):
            validate_sql("SELECT * /* FROM grid_incidents */ FROM pg_tables")

    def test_valid_query_with_harmless_comment(self):
        """Comments that don't hide anything should still pass."""
        validate_sql("SELECT * FROM grid_incidents /* just a comment */ LIMIT 10")

    def test_drop_inside_comment_with_real_drop_outside(self):
        """If DROP appears both in a comment AND outside, it should be caught."""
        with pytest.raises(ValueError):
            validate_sql("SELECT * FROM grid_incidents; /* comment */ DROP TABLE grid_incidents")

    def test_multiline_block_comment_stripped(self):
        """Multi-line block comments are fully stripped."""
        sql = """SELECT * FROM grid_incidents
/* this is a
   multi-line comment
   with DROP TABLE inside */
LIMIT 10"""
        validate_sql(sql)


class TestForbiddenFunctions:
    """Verify that dangerous PostgreSQL functions are blocked."""

    @pytest.mark.parametrize("func", [
        "pg_sleep(5)",
        "pg_read_file('/etc/passwd')",
        "pg_write_file('/tmp/evil', 'data')",
        "set_config('log_statement', 'all', false)",
        "current_setting('data_directory')",
        "lo_import('/etc/passwd')",
        "lo_export(12345, '/tmp/out')",
        "dblink('host=evil', 'SELECT 1')",
        "pg_terminate_backend(1234)",
        "pg_cancel_backend(1234)",
    ])
    def test_forbidden_function_blocked(self, func):
        sql = f"SELECT {func} FROM grid_incidents LIMIT 1"
        with pytest.raises(ValueError, match="Forbidden function"):
            validate_sql(sql)

    def test_dblink_exec_blocked(self):
        """dblink_exec with DROP in args is caught by DML/DDL check or function blocklist."""
        with pytest.raises(ValueError):
            validate_sql("SELECT dblink_exec('host=evil', 'DROP TABLE x') FROM grid_incidents LIMIT 1")

    def test_forbidden_function_case_insensitive(self):
        with pytest.raises(ValueError, match="Forbidden function"):
            validate_sql("SELECT PG_SLEEP(5) FROM grid_incidents LIMIT 1")

    def test_forbidden_function_comment_split_bypass(self):
        """Function name split by a block comment should still be caught."""
        with pytest.raises(ValueError, match="Forbidden function"):
            validate_sql("SELECT pg/**/_sleep(5) FROM grid_incidents LIMIT 1")

    def test_forbidden_function_quoted_identifier(self):
        """Quoted-identifier form of a forbidden function should be caught."""
        with pytest.raises(ValueError, match="Forbidden function"):
            validate_sql('SELECT "pg_sleep"(5) FROM grid_incidents LIMIT 1')

    def test_legitimate_function_ending_with_forbidden_name(self):
        """Functions whose names end with a forbidden name should NOT be blocked."""
        # my_current_setting is not current_setting — should pass
        validate_sql("SELECT my_current_setting(%s) FROM grid_incidents LIMIT 1")

    def test_legitimate_function_with_dblink_suffix(self):
        """app_dblink is not dblink — should pass."""
        validate_sql("SELECT app_dblink(%s) FROM grid_incidents LIMIT 1")


class TestInputLengthLimit:
    """Verify that overly long SQL is rejected."""

    def test_sql_exceeding_max_length(self):
        long_sql = "SELECT * FROM grid_incidents WHERE " + "x = %s AND " * 500
        assert len(long_sql) > MAX_SQL_LENGTH
        with pytest.raises(ValueError, match="maximum length"):
            validate_sql(long_sql)

    def test_sql_at_max_length_passes(self):
        """A query right at the limit should still be validated normally."""
        base = "SELECT * FROM grid_incidents WHERE feeder_id = %s LIMIT 10"
        padding = " " * (MAX_SQL_LENGTH - len(base))
        sql = base + padding
        assert len(sql) <= MAX_SQL_LENGTH
        validate_sql(sql)
