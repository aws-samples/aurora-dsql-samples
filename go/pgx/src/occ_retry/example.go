/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Package occ_retry demonstrates handling Optimistic Concurrency Control (OCC)
// conflicts in Aurora DSQL using the occretry utility package.
//
// This example shows:
//   - How to use occretry.WithRetry for transactional operations
//   - How to use occretry.IsOCCError to detect OCC conflicts
//   - Best practices for retry configuration
//
// For the core OCC retry utilities, see the occretry package.
package occ_retry

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/awslabs/aurora-dsql-connectors/go/pgx/dsql"
	"github.com/awslabs/aurora-dsql-connectors/go/pgx/occretry"
	"github.com/jackc/pgx/v5"
)

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
	return occretry.ExecWithRetry(ctx, pool, `
		CREATE TABLE IF NOT EXISTS counter (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(255) NOT NULL UNIQUE,
			value INT NOT NULL DEFAULT 0
		)
	`, 5)
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

	// Use WithRetry for INSERT after schema changes (may get OC001)
	err = occretry.WithRetry(ctx, pool, occretry.DefaultConfig(), func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`INSERT INTO counter (name, value) VALUES ($1, 0) RETURNING id`,
			name,
		).Scan(&id)
	})
	return id, err
}

func incrementCounter(ctx context.Context, pool *dsql.Pool, counterID string, amount int) (int, error) {
	var newValue int

	// Use occretry.WithRetry for automatic OCC conflict handling
	err := occretry.WithRetry(ctx, pool, occretry.DefaultConfig(), func(tx pgx.Tx) error {
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
	fmt.Println("  - Use occretry.IsOCCError to detect OCC conflicts (OC000, OC001)")
	fmt.Println("  - Use occretry.WithRetry for transactional operations")
	fmt.Println("  - Use occretry.ExecWithRetry for simple DDL/DML statements")
	fmt.Println("  - Configure retry behavior with occretry.Config")

	return nil
}
