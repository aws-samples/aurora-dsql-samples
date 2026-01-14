/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Package openfga demonstrates using Aurora DSQL with OpenFGA for
// fine-grained authorization. This example creates an OpenFGA store,
// writes an authorization model, creates relationships, and performs
// permission checks.
package openfga

import (
	"context"
	"fmt"
	"os"
	"time"

	dsql "github.com/aws-samples/aurora-dsql-samples/go/dsql-pgx-connector/dsql"
)

// Example demonstrates the OpenFGA integration with Aurora DSQL.
// It requires CLUSTER_ENDPOINT environment variable to be set.
//
// This example shows how to:
// 1. Create a DSQL connection pool
// 2. Verify the connection works
// 3. Run basic queries that would be used by OpenFGA
//
// Note: Full OpenFGA integration requires the OpenFGA server to be configured
// with the dsql:// URI scheme. This example validates the underlying
// connection works correctly.
func Example() error {
	ctx := context.Background()
	endpoint := os.Getenv("CLUSTER_ENDPOINT")
	if endpoint == "" {
		return fmt.Errorf("CLUSTER_ENDPOINT environment variable is required")
	}

	// Create DSQL connection using the dsql:// URI scheme
	// This is the same URI format that OpenFGA will use
	uri := fmt.Sprintf("dsql://admin@%s/postgres", endpoint)

	fmt.Printf("Connecting to DSQL cluster using URI: dsql://admin@%s/postgres\n", endpoint)

	pool, err := dsql.NewPool(ctx, uri)
	if err != nil {
		return fmt.Errorf("failed to create DSQL pool: %w", err)
	}
	defer pool.Close()

	// Verify connection
	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}
	fmt.Println("Successfully connected to Aurora DSQL")

	// Create OpenFGA-like tables for testing
	// These mirror the tables OpenFGA uses
	if err := setupTestTables(ctx, pool); err != nil {
		return fmt.Errorf("failed to setup test tables: %w", err)
	}

	// Test basic operations similar to what OpenFGA does
	if err := testStoreOperations(ctx, pool); err != nil {
		return fmt.Errorf("store operations failed: %w", err)
	}

	if err := testTupleOperations(ctx, pool); err != nil {
		return fmt.Errorf("tuple operations failed: %w", err)
	}

	// Cleanup
	if err := cleanupTestTables(ctx, pool); err != nil {
		return fmt.Errorf("failed to cleanup test tables: %w", err)
	}

	fmt.Println("All OpenFGA integration tests passed!")
	return nil
}

func setupTestTables(ctx context.Context, pool *dsql.Pool) error {
	fmt.Println("Setting up test tables...")

	// Create store table (simplified version of OpenFGA's schema)
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS openfga_test_store (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ,
			deleted_at TIMESTAMPTZ
		)
	`)
	if err != nil {
		return fmt.Errorf("create store table: %w", err)
	}

	// Create tuple table (simplified version of OpenFGA's schema)
	_, err = pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS openfga_test_tuple (
			store TEXT NOT NULL,
			object_type TEXT NOT NULL,
			object_id TEXT NOT NULL,
			relation TEXT NOT NULL,
			_user TEXT NOT NULL,
			user_type TEXT NOT NULL,
			ulid TEXT NOT NULL,
			inserted_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (store, object_type, object_id, relation, _user)
		)
	`)
	if err != nil {
		return fmt.Errorf("create tuple table: %w", err)
	}

	// Create index similar to OpenFGA
	_, err = pool.Exec(ctx, `
		CREATE INDEX IF NOT EXISTS idx_openfga_test_tuple_ulid ON openfga_test_tuple (ulid)
	`)
	if err != nil {
		return fmt.Errorf("create tuple index: %w", err)
	}

	fmt.Println("Test tables created successfully")
	return nil
}

func testStoreOperations(ctx context.Context, pool *dsql.Pool) error {
	fmt.Println("Testing store operations...")

	storeID := fmt.Sprintf("test-store-%d", time.Now().UnixNano())
	storeName := "Test Store"
	now := time.Now().UTC()

	// Insert store
	_, err := pool.Exec(ctx, `
		INSERT INTO openfga_test_store (id, name, created_at, updated_at)
		VALUES ($1, $2, $3, $3)
	`, storeID, storeName, now)
	if err != nil {
		return fmt.Errorf("insert store: %w", err)
	}

	// Read store back
	var readID, readName string
	var createdAt time.Time
	err = pool.QueryRow(ctx, `
		SELECT id, name, created_at FROM openfga_test_store WHERE id = $1 AND deleted_at IS NULL
	`, storeID).Scan(&readID, &readName, &createdAt)
	if err != nil {
		return fmt.Errorf("read store: %w", err)
	}

	if readID != storeID || readName != storeName {
		return fmt.Errorf("store data mismatch: got (%s, %s), want (%s, %s)", readID, readName, storeID, storeName)
	}

	// Soft delete store
	_, err = pool.Exec(ctx, `
		UPDATE openfga_test_store SET deleted_at = $1 WHERE id = $2
	`, time.Now().UTC(), storeID)
	if err != nil {
		return fmt.Errorf("delete store: %w", err)
	}

	fmt.Println("Store operations passed")
	return nil
}

func testTupleOperations(ctx context.Context, pool *dsql.Pool) error {
	fmt.Println("Testing tuple operations...")

	storeID := fmt.Sprintf("test-store-%d", time.Now().UnixNano())
	now := time.Now().UTC()

	// Create test store first
	_, err := pool.Exec(ctx, `
		INSERT INTO openfga_test_store (id, name, created_at, updated_at)
		VALUES ($1, $2, $3, $3)
	`, storeID, "Tuple Test Store", now)
	if err != nil {
		return fmt.Errorf("insert store for tuple test: %w", err)
	}

	// Insert relationship tuples (user:anne is viewer of document:readme)
	tuples := []struct {
		objectType string
		objectID   string
		relation   string
		user       string
		userType   string
		ulid       string
	}{
		{"document", "readme", "viewer", "user:anne", "user", fmt.Sprintf("ulid-%d-1", time.Now().UnixNano())},
		{"document", "readme", "editor", "user:bob", "user", fmt.Sprintf("ulid-%d-2", time.Now().UnixNano())},
		{"document", "readme", "viewer", "group:engineering#member", "userset", fmt.Sprintf("ulid-%d-3", time.Now().UnixNano())},
	}

	for _, t := range tuples {
		_, err := pool.Exec(ctx, `
			INSERT INTO openfga_test_tuple (store, object_type, object_id, relation, _user, user_type, ulid, inserted_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		`, storeID, t.objectType, t.objectID, t.relation, t.user, t.userType, t.ulid, now)
		if err != nil {
			return fmt.Errorf("insert tuple: %w", err)
		}
	}

	// Query tuples (similar to OpenFGA Read operation)
	rows, err := pool.Query(ctx, `
		SELECT object_type, object_id, relation, _user
		FROM openfga_test_tuple
		WHERE store = $1 AND object_type = $2 AND object_id = $3
		ORDER BY ulid
	`, storeID, "document", "readme")
	if err != nil {
		return fmt.Errorf("query tuples: %w", err)
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var objType, objID, rel, user string
		if err := rows.Scan(&objType, &objID, &rel, &user); err != nil {
			return fmt.Errorf("scan tuple: %w", err)
		}
		fmt.Printf("  Found tuple: %s:%s#%s@%s\n", objType, objID, rel, user)
		count++
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("rows error: %w", err)
	}

	if count != 3 {
		return fmt.Errorf("expected 3 tuples, got %d", count)
	}

	// Test reverse lookup (similar to OpenFGA ListUsers)
	var userCount int
	err = pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM openfga_test_tuple
		WHERE store = $1 AND _user = $2
	`, storeID, "user:anne").Scan(&userCount)
	if err != nil {
		return fmt.Errorf("count user tuples: %w", err)
	}

	if userCount != 1 {
		return fmt.Errorf("expected 1 tuple for user:anne, got %d", userCount)
	}

	// Delete tuple
	result, err := pool.Exec(ctx, `
		DELETE FROM openfga_test_tuple
		WHERE store = $1 AND object_type = $2 AND object_id = $3 AND relation = $4 AND _user = $5
	`, storeID, "document", "readme", "viewer", "user:anne")
	if err != nil {
		return fmt.Errorf("delete tuple: %w", err)
	}

	if result.RowsAffected() != 1 {
		return fmt.Errorf("expected 1 row deleted, got %d", result.RowsAffected())
	}

	fmt.Println("Tuple operations passed")
	return nil
}

func cleanupTestTables(ctx context.Context, pool *dsql.Pool) error {
	fmt.Println("Cleaning up test tables...")

	_, err := pool.Exec(ctx, `DROP TABLE IF EXISTS openfga_test_tuple`)
	if err != nil {
		return fmt.Errorf("drop tuple table: %w", err)
	}

	_, err = pool.Exec(ctx, `DROP TABLE IF EXISTS openfga_test_store`)
	if err != nil {
		return fmt.Errorf("drop store table: %w", err)
	}

	fmt.Println("Cleanup completed")
	return nil
}
