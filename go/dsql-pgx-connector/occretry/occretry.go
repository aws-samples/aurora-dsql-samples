/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Package occretry provides utilities for handling Optimistic Concurrency Control (OCC)
// conflicts in Aurora DSQL.
//
// Aurora DSQL uses OCC where conflicts are detected at commit time. When two
// transactions modify the same data, the first to commit wins and the second
// receives an OCC error (codes "OC000" or "OC001"). Applications should retry
// failed transactions with exponential backoff.
//
// Key concepts:
//   - OCC allows high concurrency by not locking rows during reads
//   - Conflicts are only detected at commit time
//   - Failed transactions should be retried with fresh data
//   - Use exponential backoff with jitter to avoid thundering herd
//
// For more information, see:
// https://aws.amazon.com/blogs/database/concurrency-control-in-amazon-aurora-dsql/
package occretry

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/aws-samples/aurora-dsql-samples/go/dsql-pgx-connector/dsql"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// OCC error codes for Aurora DSQL optimistic concurrency control conflicts.
const (
	// ErrorCodeMutation is returned when a mutation conflicts with another transaction.
	// This occurs when two transactions try to modify the same rows concurrently.
	ErrorCodeMutation = "OC000"

	// ErrorCodeSchema is returned when a schema change conflicts with the transaction.
	// This occurs after DDL operations (CREATE TABLE, ALTER TABLE, etc.) when
	// subsequent transactions see the schema change.
	ErrorCodeSchema = "OC001"
)

// Config holds configuration for retry behavior.
type Config struct {
	// MaxRetries is the maximum number of retry attempts (default: 3)
	MaxRetries int

	// InitialWait is the initial wait duration before first retry (default: 100ms)
	InitialWait time.Duration

	// MaxWait is the maximum wait duration between retries (default: 5s)
	MaxWait time.Duration

	// Multiplier is the exponential backoff multiplier (default: 2.0)
	Multiplier float64
}

// DefaultConfig returns sensible defaults for DSQL OCC retry.
func DefaultConfig() Config {
	return Config{
		MaxRetries:  3,
		InitialWait: 100 * time.Millisecond,
		MaxWait:     5 * time.Second,
		Multiplier:  2.0,
	}
}

// IsOCCError checks if an error is a DSQL OCC conflict error.
// Returns true for both OC000 (mutation conflict) and OC001 (schema conflict) errors.
// DSQL returns these as SQLSTATE 40001 (serialization_failure) with OC000/OC001 in the message.
func IsOCCError(err error) bool {
	if err == nil {
		return false
	}
	// Check error message for OCC codes (DSQL includes OC000/OC001 in the message)
	errStr := err.Error()
	if strings.Contains(errStr, ErrorCodeMutation) || strings.Contains(errStr, ErrorCodeSchema) {
		return true
	}
	// Also check for SQLSTATE 40001 (serialization_failure) which DSQL uses
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "40001"
	}
	return false
}

// backoffWait waits with exponential backoff and jitter. Returns the next wait duration.
func backoffWait(ctx context.Context, wait time.Duration, config Config) (time.Duration, error) {
	jitter := time.Duration(rand.Int63n(int64(wait / 4)))
	sleepTime := wait + jitter

	select {
	case <-ctx.Done():
		return 0, ctx.Err()
	case <-time.After(sleepTime):
	}

	nextWait := time.Duration(float64(wait) * config.Multiplier)
	if nextWait > config.MaxWait {
		nextWait = config.MaxWait
	}
	return nextWait, nil
}

// WithRetry executes a transactional function with automatic retry on OCC conflicts.
// The function fn receives a transaction and should perform all database operations
// within that transaction. If an OCC error occurs, the transaction is rolled back
// and retried with exponential backoff.
//
// Example:
//
//	err := occretry.WithRetry(ctx, pool, occretry.DefaultConfig(), func(tx pgx.Tx) error {
//	    _, err := tx.Exec(ctx, "UPDATE accounts SET balance = balance - $1 WHERE id = $2", amount, fromID)
//	    if err != nil {
//	        return err
//	    }
//	    _, err = tx.Exec(ctx, "UPDATE accounts SET balance = balance + $1 WHERE id = $2", amount, toID)
//	    return err
//	})
func WithRetry(ctx context.Context, pool *dsql.Pool, config Config, fn func(tx pgx.Tx) error) error {
	var lastErr error
	wait := config.InitialWait

	for attempt := 0; attempt <= config.MaxRetries; attempt++ {
		if attempt > 0 {
			var err error
			wait, err = backoffWait(ctx, wait, config)
			if err != nil {
				return err
			}
		}

		err, shouldRetry := executeTransaction(ctx, pool, fn)
		if err != nil {
			if shouldRetry {
				lastErr = err
				continue
			}
			return err
		}
		return nil // success
	}

	return fmt.Errorf("max retries (%d) exceeded, last error: %w", config.MaxRetries, lastErr)
}

// executeTransaction runs a single transaction attempt.
// Returns (error, shouldRetry) where shouldRetry indicates if the error is an OCC conflict.
func executeTransaction(ctx context.Context, pool *dsql.Pool, fn func(tx pgx.Tx) error) (error, bool) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err), false
	}
	defer tx.Rollback(ctx) // No-op if committed

	if err := fn(tx); err != nil {
		if IsOCCError(err) {
			return err, true
		}
		return err, false
	}

	if err := tx.Commit(ctx); err != nil {
		if IsOCCError(err) {
			return err, true
		}
		return fmt.Errorf("commit transaction: %w", err), false
	}

	return nil, false
}

// ExecWithRetry executes a SQL statement with automatic retry on OCC conflicts.
// This is useful for DDL statements and simple DML that don't need explicit transactions.
//
// Example:
//
//	err := occretry.ExecWithRetry(ctx, pool, "CREATE TABLE users (id UUID PRIMARY KEY)", 5)
func ExecWithRetry(ctx context.Context, pool *dsql.Pool, sql string, maxRetries int) error {
	config := DefaultConfig()
	config.MaxRetries = maxRetries

	var lastErr error
	wait := config.InitialWait

	for attempt := 0; attempt <= config.MaxRetries; attempt++ {
		if attempt > 0 {
			var err error
			wait, err = backoffWait(ctx, wait, config)
			if err != nil {
				return err
			}
		}

		_, err := pool.Exec(ctx, sql)
		if err == nil {
			return nil
		}
		if IsOCCError(err) {
			lastErr = err
			continue
		}
		return err
	}

	return fmt.Errorf("exec failed after %d retries: %w", config.MaxRetries, lastErr)
}
