# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""OCC retry logic with exponential backoff for Aurora DSQL batch operations."""

import logging
import time

import psycopg2
import psycopg2.errors

logger = logging.getLogger(__name__)


class MaxRetriesExceeded(Exception):
    """Raised when a batch operation exceeds the maximum number of OCC retries."""

    def __init__(self, max_retries):
        super().__init__(
            f"Max retries exceeded: failed after {max_retries} retries"
        )
        self.max_retries = max_retries


def execute_with_retry(connection, operation, max_retries=3, base_delay_ms=100):
    """Execute a database operation with OCC conflict retry and exponential backoff.

    Runs ``operation(connection)`` and retries on serialization failures
    (SQLSTATE 40001) using exponential backoff. Each retry rolls back the
    current transaction before waiting.

    Args:
        connection: A psycopg2 connection object.
        operation: A callable that accepts a connection and performs database
            work. It should NOT commit — the caller is responsible for commits.
        max_retries: Maximum number of retry attempts (default 3).
        base_delay_ms: Base delay in milliseconds for exponential backoff
            (default 100).

    Returns:
        The return value of ``operation(connection)``.

    Raises:
        MaxRetriesExceeded: If the operation fails with OCC conflicts after
            ``max_retries`` retry attempts.
    """
    for attempt in range(max_retries + 1):
        try:
            return operation(connection)
        except psycopg2.errors.SerializationFailure:
            connection.rollback()
            if attempt >= max_retries:
                raise MaxRetriesExceeded(max_retries)
            delay_ms = base_delay_ms * (2 ** attempt)
            logger.warning(
                "OCC conflict, retry %d/%d after %dms",
                attempt + 1,
                max_retries,
                delay_ms,
            )
            time.sleep(delay_ms / 1000.0)
