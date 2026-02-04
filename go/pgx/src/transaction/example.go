/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Package transaction demonstrates proper transaction handling with Aurora DSQL.
//
// Aurora DSQL supports standard PostgreSQL transaction semantics with BEGIN, COMMIT,
// and ROLLBACK. This example shows:
//   - Starting and committing transactions
//   - Rolling back on errors
//   - Using pgx transaction helpers
//   - Using occretry for OCC conflict handling
//
// DSQL transaction limits:
//   - Maximum 3,000 rows modified per transaction
//   - Maximum 10 MiB data size per transaction
//   - Maximum 5 minute transaction duration
//
// DSQL does not support SAVEPOINT (partial rollbacks are not available).
package transaction

import (
	"context"
	"fmt"
	"os"

	"github.com/awslabs/aurora-dsql-connectors/go/pgx/dsql"
	"github.com/awslabs/aurora-dsql-connectors/go/pgx/occretry"
	"github.com/jackc/pgx/v5"
)

// Account represents a bank account for the transfer demo.
type Account struct {
	ID      string
	Name    string
	Balance int
}

// createSchema sets up the accounts table with UUID primary key.
// It drops and recreates the table to ensure a clean state.
// Uses occretry.ExecWithRetry for OCC errors that may occur after schema changes.
func createSchema(ctx context.Context, pool *dsql.Pool) error {
	// Drop existing table to ensure clean state
	if err := occretry.ExecWithRetry(ctx, pool, `DROP TABLE IF EXISTS account`, 5); err != nil {
		return fmt.Errorf("drop account table: %w", err)
	}

	if err := occretry.ExecWithRetry(ctx, pool, `
		CREATE TABLE account (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(255) NOT NULL,
			balance INT NOT NULL DEFAULT 0
		)
	`, 5); err != nil {
		return fmt.Errorf("create account table: %w", err)
	}

	return nil
}

// seedAccounts creates test accounts and returns their IDs.
// Uses occretry.WithRetry for OCC errors that may occur after schema changes.
func seedAccounts(ctx context.Context, pool *dsql.Pool) (aliceID, bobID string, err error) {
	// Use WithRetry for inserts after schema changes (may get OC001)
	err = occretry.WithRetry(ctx, pool, occretry.DefaultConfig(), func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx,
			`INSERT INTO account (name, balance) VALUES ($1, $2) RETURNING id`,
			"Alice", 1000,
		).Scan(&aliceID)
		if err != nil {
			return fmt.Errorf("failed to create Alice: %w", err)
		}

		err = tx.QueryRow(ctx,
			`INSERT INTO account (name, balance) VALUES ($1, $2) RETURNING id`,
			"Bob", 500,
		).Scan(&bobID)
		if err != nil {
			return fmt.Errorf("failed to create Bob: %w", err)
		}

		return nil
	})

	return aliceID, bobID, err
}

// transferFunds demonstrates a transactional money transfer between accounts.
// Uses occretry.WithRetry for automatic OCC conflict handling.
func transferFunds(ctx context.Context, pool *dsql.Pool, fromID, toID string, amount int) error {
	var newFromBalance int

	return occretry.WithRetry(ctx, pool, occretry.DefaultConfig(), func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx,
			`UPDATE account SET balance = balance - $1 WHERE id = $2 RETURNING balance`,
			amount, fromID,
		).Scan(&newFromBalance)
		if err != nil {
			return fmt.Errorf("failed to debit account: %w", err)
		}

		if newFromBalance < 0 {
			return fmt.Errorf("insufficient funds: balance would be %d", newFromBalance)
		}

		_, err = tx.Exec(ctx,
			`UPDATE account SET balance = balance + $1 WHERE id = $2`,
			amount, toID,
		)
		if err != nil {
			return fmt.Errorf("failed to credit account: %w", err)
		}

		return nil
	})
}

// transferFundsWithCallback demonstrates using pgx.BeginTxFunc for cleaner transaction handling.
// Note: This does not include OCC retry - use occretry.WithRetry for production code.
func transferFundsWithCallback(ctx context.Context, pool *dsql.Pool, fromID, toID string, amount int) error {
	return pgx.BeginTxFunc(ctx, pool, pgx.TxOptions{}, func(tx pgx.Tx) error {
		var newFromBalance int
		err := tx.QueryRow(ctx,
			`UPDATE account SET balance = balance - $1 WHERE id = $2 RETURNING balance`,
			amount, fromID,
		).Scan(&newFromBalance)
		if err != nil {
			return fmt.Errorf("failed to debit account: %w", err)
		}

		if newFromBalance < 0 {
			return fmt.Errorf("insufficient funds: balance would be %d", newFromBalance)
		}

		_, err = tx.Exec(ctx,
			`UPDATE account SET balance = balance + $1 WHERE id = $2`,
			amount, toID,
		)
		if err != nil {
			return fmt.Errorf("failed to credit account: %w", err)
		}

		return nil
	})
}

// getBalance retrieves an account's current balance.
func getBalance(ctx context.Context, pool *dsql.Pool, accountID string) (int, error) {
	var balance int
	err := pool.QueryRow(ctx, `SELECT balance FROM account WHERE id = $1`, accountID).Scan(&balance)
	return balance, err
}

// cleanup removes test data.
func cleanup(ctx context.Context, pool *dsql.Pool) error {
	_, err := pool.Exec(ctx, `DELETE FROM account WHERE name IN ('Alice', 'Bob')`)
	return err
}

// Example demonstrates transaction handling with Aurora DSQL.
func Example() error {
	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	if clusterEndpoint == "" {
		return fmt.Errorf("CLUSTER_ENDPOINT environment variable is not set")
	}

	ctx := context.Background()

	pool, err := dsql.NewPool(ctx, dsql.Config{
		Host:     clusterEndpoint,
		MaxConns: 5,
	})
	if err != nil {
		return fmt.Errorf("create pool: %w", err)
	}
	defer pool.Close()

	if err := createSchema(ctx, pool); err != nil {
		return fmt.Errorf("create schema: %w", err)
	}

	aliceID, bobID, err := seedAccounts(ctx, pool)
	if err != nil {
		return fmt.Errorf("seed accounts: %w", err)
	}
	defer cleanup(ctx, pool)

	fmt.Println("Initial balances:")
	aliceBalance, _ := getBalance(ctx, pool, aliceID)
	bobBalance, _ := getBalance(ctx, pool, bobID)
	fmt.Printf("  Alice: $%d\n", aliceBalance)
	fmt.Printf("  Bob: $%d\n", bobBalance)

	fmt.Println("\nTransferring $200 from Alice to Bob (with OCC retry)...")
	if err := transferFunds(ctx, pool, aliceID, bobID, 200); err != nil {
		return fmt.Errorf("transfer failed: %w", err)
	}

	fmt.Println("After first transfer:")
	aliceBalance, _ = getBalance(ctx, pool, aliceID)
	bobBalance, _ = getBalance(ctx, pool, bobID)
	fmt.Printf("  Alice: $%d\n", aliceBalance)
	fmt.Printf("  Bob: $%d\n", bobBalance)

	fmt.Println("\nTransferring $100 from Bob to Alice (callback pattern, no retry)...")
	if err := transferFundsWithCallback(ctx, pool, bobID, aliceID, 100); err != nil {
		return fmt.Errorf("transfer failed: %w", err)
	}

	fmt.Println("After second transfer:")
	aliceBalance, _ = getBalance(ctx, pool, aliceID)
	bobBalance, _ = getBalance(ctx, pool, bobID)
	fmt.Printf("  Alice: $%d\n", aliceBalance)
	fmt.Printf("  Bob: $%d\n", bobBalance)

	fmt.Println("\nAttempting invalid transfer (Alice has $900, trying to send $1000)...")
	err = transferFunds(ctx, pool, aliceID, bobID, 1000)
	if err != nil {
		fmt.Printf("Transfer correctly rejected: %v\n", err)
	}

	fmt.Println("Balances unchanged after failed transfer:")
	aliceBalance, _ = getBalance(ctx, pool, aliceID)
	bobBalance, _ = getBalance(ctx, pool, bobID)
	fmt.Printf("  Alice: $%d\n", aliceBalance)
	fmt.Printf("  Bob: $%d\n", bobBalance)

	fmt.Println("\nTransaction example completed successfully!")
	return nil
}
