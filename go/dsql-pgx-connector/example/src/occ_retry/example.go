/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Package occ_retry demonstrates handling Optimistic Concurrency Control (OCC)
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
//   - Use exponential backoff to avoid thundering herd
package occ_retry

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"os"
	"strings"
	"time"

	"github.com/aws-samples/aurora-dsql-samples/go/dsql-pgx-connector/dsql"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// OCC error codes for Aurora DSQL optimistic concurrency control conflicts.
// OC000: "mutation conflicts with another transaction" - concurrent writes to same rows
// OC001: "schema has been updated by another transaction" - catalog/DDL conflict
const (
	OCCErrorCode  = "OC000"
	OCCErrorCode2 = "OC001"
)

// RetryConfig holds configuration for retry behavior.
type RetryConfig struct {
	MaxRetries  int
	InitialWait time.Duration
	MaxWait     time.Duration
	Multiplier  float64
}

// DefaultRetryConfig returns sensible defaults for DSQL OCC retry.
func DefaultRetryConfig() RetryConfig {
	return RetryConfig{
		MaxRetries:  3,
		InitialWait: 100 * time.Millisecond,
		MaxWait:     5 * time.Second,
		Multiplier:  2.0,
	}
}

// IsOCCError checks if an error is a DSQL OCC conflict error.
// Checks for both OC000 and OC001 error codes.
func IsOCCError(err error) bool {
	if err == nil {
		return false
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == OCCErrorCode || pgErr.Code == OCCErrorCode2
	}
	errStr := err.Error()
	return strings.Contains(errStr, OCCErrorCode) || strings.Contains(errStr, OCCErrorCode2)
}

// WithRetry executes a function with automatic retry on OCC conflicts.
func WithRetry(ctx context.Context, pool *dsql.Pool, config RetryConfig, fn func(tx pgx.Tx) error) error {
	var lastErr error
	wait := config.InitialWait

	for attempt := 0; attempt <= config.MaxRetries; attempt++ {
		if attempt > 0 {
			jitter := time.Duration(rand.Int63n(int64(wait / 4)))
			sleepTime := wait + jitter

			fmt.Printf("  Retry attempt %d/%d after %v...\n", attempt, config.MaxRetries, sleepTime)

			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(sleepTime):
			}

			wait = time.Duration(float64(wait) * config.Multiplier)
			if wait > config.MaxWait {
				wait = config.MaxWait
			}
		}

		// Use anonymous function to properly scope the defer for each iteration
		err, shouldContinue := func() (error, bool) {
			tx, err := pool.Begin(ctx)
			if err != nil {
				return fmt.Errorf("failed to begin transaction: %w", err), false
			}
			defer tx.Rollback(ctx) // No-op if committed, ensures cleanup

			err = fn(tx)
			if err != nil {
				if IsOCCError(err) {
					lastErr = err
					fmt.Printf("  OCC conflict detected: %v\n", err)
					return nil, true // continue retry loop
				}
				return err, false
			}

			err = tx.Commit(ctx)
			if err != nil {
				if IsOCCError(err) {
					lastErr = err
					fmt.Printf("  OCC conflict on commit: %v\n", err)
					return nil, true // continue retry loop
				}
				return fmt.Errorf("failed to commit: %w", err), false
			}

			return nil, false // success
		}()

		if err != nil {
			return err
		}
		if shouldContinue {
			continue
		}
		return nil // success
	}

	return fmt.Errorf("max retries (%d) exceeded, last error: %w", config.MaxRetries, lastErr)
}

// Counter represents a simple counter entity.
//
// NOTE: The read-modify-write pattern used in this example (incrementCounter)
// intentionally creates contention to demonstrate OCC retry handling.
// In production, avoid this pattern as it creates "hot keys". Instead:
//   - Prefer append-only patterns over update-in-place
//   - Compute aggregates via SELECT queries rather than maintaining counters
//
// See: https://marc-bowes.com/dsql-avoid-hot-keys.html
type Counter struct {
	ID    string
	Name  string
	Value int
}

func createSchema(ctx context.Context, pool *dsql.Pool) error {
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS counter (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(255) NOT NULL UNIQUE,
			value INT NOT NULL DEFAULT 0
		)
	`)
	return err
}

func getOrCreateCounter(ctx context.Context, pool *dsql.Pool, name string) (string, error) {
	var id string

	err := pool.QueryRow(ctx, `SELECT id FROM counter WHERE name = $1`, name).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}

	err = pool.QueryRow(ctx,
		`INSERT INTO counter (name, value) VALUES ($1, 0) RETURNING id`,
		name,
	).Scan(&id)
	return id, err
}

func incrementCounter(ctx context.Context, pool *dsql.Pool, counterID string, amount int) (int, error) {
	var newValue int

	err := WithRetry(ctx, pool, DefaultRetryConfig(), func(tx pgx.Tx) error {
		var currentValue int
		err := tx.QueryRow(ctx, `SELECT value FROM counter WHERE id = $1`, counterID).Scan(&currentValue)
		if err != nil {
			return fmt.Errorf("failed to read counter: %w", err)
		}

		newValue = currentValue + amount
		_, err = tx.Exec(ctx, `UPDATE counter SET value = $1 WHERE id = $2`, newValue, counterID)
		if err != nil {
			return fmt.Errorf("failed to update counter: %w", err)
		}

		return nil
	})

	return newValue, err
}

func getCounterValue(ctx context.Context, pool *dsql.Pool, counterID string) (int, error) {
	var value int
	err := pool.QueryRow(ctx, `SELECT value FROM counter WHERE id = $1`, counterID).Scan(&value)
	return value, err
}

func cleanup(ctx context.Context, pool *dsql.Pool) error {
	_, err := pool.Exec(ctx, `DELETE FROM counter WHERE name = 'demo-counter'`)
	return err
}

// Example demonstrates OCC retry handling with Aurora DSQL.
func Example() error {
	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	if clusterEndpoint == "" {
		return fmt.Errorf("CLUSTER_ENDPOINT environment variable is not set")
	}

	ctx := context.Background()

	pool, err := dsql.NewPool(ctx, dsql.Config{
		Host:     clusterEndpoint,
		MaxConns: 10,
	})
	if err != nil {
		return fmt.Errorf("failed to create pool: %w", err)
	}
	defer pool.Close()

	if err := createSchema(ctx, pool); err != nil {
		return fmt.Errorf("failed to create schema: %w", err)
	}

	counterID, err := getOrCreateCounter(ctx, pool, "demo-counter")
	if err != nil {
		return fmt.Errorf("failed to create counter: %w", err)
	}
	defer cleanup(ctx, pool)

	fmt.Println("OCC Retry Example")
	fmt.Println("=================")
	fmt.Println()
	fmt.Println("This example demonstrates automatic retry on OCC conflicts.")
	fmt.Println("DSQL uses optimistic concurrency control - conflicts are detected at commit.")
	fmt.Println()

	initialValue, _ := getCounterValue(ctx, pool, counterID)
	fmt.Printf("Initial counter value: %d\n\n", initialValue)

	for i := 1; i <= 3; i++ {
		fmt.Printf("Increment #%d:\n", i)
		newValue, err := incrementCounter(ctx, pool, counterID, 10)
		if err != nil {
			return fmt.Errorf("failed to increment counter: %w", err)
		}
		fmt.Printf("  Counter value is now: %d\n\n", newValue)
	}

	finalValue, _ := getCounterValue(ctx, pool, counterID)
	fmt.Printf("Final counter value: %d\n", finalValue)
	fmt.Printf("Total incremented: %d\n", finalValue-initialValue)

	fmt.Println()
	fmt.Println("OCC retry example completed successfully!")
	fmt.Println()
	fmt.Println("Key takeaways:")
	fmt.Println("  - Check for OCC error codes 'OC000' and 'OC001' to detect conflicts")
	fmt.Println("  - Use exponential backoff with jitter for retries")
	fmt.Println("  - Always retry with a fresh transaction and fresh data")
	fmt.Println("  - Set a reasonable max retry limit to avoid infinite loops")

	return nil
}
