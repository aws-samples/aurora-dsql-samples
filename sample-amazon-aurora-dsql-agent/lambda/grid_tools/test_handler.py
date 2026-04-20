"""
Unit tests for SQL validation in handler.py.

Run with:
  pytest test_handler.py -v
"""

import pytest
from handler import validate_sql


@pytest.mark.parametrize("sql", [
    "SELECT * FROM grid_incidents LIMIT 10",
    "SELECT feeder_id, COUNT(*) FROM feeder_events GROUP BY feeder_id LIMIT 50",
    "WITH cte AS (SELECT * FROM grid_incidents) SELECT * FROM cte LIMIT 10",
    "SELECT g.*, f.* FROM grid_incidents g JOIN feeder_events f ON g.feeder_id = f.feeder_id LIMIT 10",
    "SELECT * FROM switching_events WHERE feeder_id = %s LIMIT 100",
    "SELECT * FROM transformer_inspections JOIN incident_weather ON transformer_inspections.feeder_id = incident_weather.feeder_id LIMIT 50",
    "SELECT * FROM maintenance_log WHERE status = %s LIMIT 10",
])
def test_valid_queries(sql):
    validate_sql(sql)


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
