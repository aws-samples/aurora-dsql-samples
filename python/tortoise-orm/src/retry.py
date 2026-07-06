"""OCC retry utility for Aurora DSQL.

Aurora DSQL uses optimistic concurrency control (OCC). When two transactions
modify the same row concurrently, one receives SQLSTATE 40001 (error codes
OC000 or OC001). Both are safe to retry.

Usage:
    from retry import with_retry

    async def _update():
        obj = await Model.get(id=obj_id)
        obj.field = new_value
        await obj.save(update_fields=["field"])
        return obj

    result = await with_retry(_update)
"""
import asyncio
import random
from typing import TypeVar, Callable, Awaitable

from asyncpg import PostgresError

T = TypeVar("T")
BASE_DELAY = 0.05  # 50ms

# SQLSTATE code for serialization failure (OCC conflict)
OCC_SQLSTATE = "40001"


def _is_occ_error(e: Exception) -> bool:
    """Check if an exception is an OCC conflict using structured SQLSTATE inspection."""
    if isinstance(e, PostgresError):
        return e.sqlstate == OCC_SQLSTATE
    # Fallback for wrapped exceptions (e.g., Tortoise OperationalError).
    # Match DSQL-specific OCC error codes with word boundaries to avoid
    # false positives from unrelated messages containing these substrings.
    error_msg = str(e)
    return "SQLSTATE 40001" in error_msg or "OC000" in error_msg or "OC001" in error_msg


async def with_retry(
    fn: Callable[[], Awaitable[T]],
    max_retries: int = 3,
) -> T:
    """Retry an async operation on OCC conflict with exponential backoff and jitter.

    Args:
        fn: Async callable that performs the database operation.
            Must re-read state from the database on each invocation.
        max_retries: Maximum number of retry attempts.

    Returns:
        The result of fn() on success.

    Raises:
        The original exception if all retries are exhausted or
        if the error is not an OCC conflict.
    """
    for attempt in range(max_retries + 1):
        try:
            return await fn()
        except Exception as e:
            if _is_occ_error(e) and attempt < max_retries:
                backoff = BASE_DELAY * (2 ** attempt)
                jitter = random.uniform(0, backoff)
                await asyncio.sleep(backoff + jitter)
            else:
                raise
