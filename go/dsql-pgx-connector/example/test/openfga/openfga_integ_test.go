// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package openfga

import (
	"context"
	"fmt"
	"math/rand"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/aws-samples/aurora-dsql-samples/go/dsql-pgx-connector/dsql"
	"github.com/stretchr/testify/require"
)

// isOCCError checks if an error is an OCC (Optimistic Concurrency Control) conflict.
func isOCCError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return strings.Contains(errStr, "OC000") || strings.Contains(errStr, "OC001")
}

// execWithRetry executes a SQL statement with retry logic for OCC errors.
func execWithRetry(ctx context.Context, pool *dsql.Pool, sql string, maxRetries int) error {
	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			// Exponential backoff with jitter
			backoff := time.Duration(1<<uint(attempt-1))*200*time.Millisecond + time.Duration(rand.Intn(100))*time.Millisecond
			time.Sleep(backoff)
		}
		_, err := pool.Exec(ctx, sql)
		if err == nil {
			return nil
		}
		if isOCCError(err) {
			lastErr = err
			continue
		}
		return err
	}
	return fmt.Errorf("failed after %d retries: %w", maxRetries, lastErr)
}

// TestCleanupOpenFGATables drops all OpenFGA-related tables to ensure a clean state.
// This is useful for CI pipelines that need to start fresh before running migrations.
func TestCleanupOpenFGATables(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// Get cluster endpoint from environment
	endpoint := os.Getenv("CLUSTER_ENDPOINT")
	if endpoint == "" {
		t.Skip("CLUSTER_ENDPOINT not set, skipping integration test")
	}

	// Create connection pool
	pool, err := dsql.NewPool(ctx, dsql.Config{
		Host: endpoint,
	})
	require.NoError(t, err)
	defer pool.Close()

	// Drop all OpenFGA tables including goose migration table
	dropSQL := []string{
		"DROP TABLE IF EXISTS changelog",
		"DROP TABLE IF EXISTS assertion",
		"DROP TABLE IF EXISTS authorization_model",
		"DROP TABLE IF EXISTS store",
		"DROP TABLE IF EXISTS tuple",
		"DROP TABLE IF EXISTS goose_db_version",
	}

	for _, sql := range dropSQL {
		err := execWithRetry(ctx, pool, sql, 5)
		require.NoError(t, err, "Failed to drop table: %s", sql)
	}

	t.Log("All OpenFGA tables cleaned up successfully")
}

// TestOpenFGASchemaSetup validates that the DSQL connector can be used to set up
// the OpenFGA schema. This test creates the tables and indexes required by OpenFGA.
func TestOpenFGASchemaSetup(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// Get cluster endpoint from environment
	endpoint := os.Getenv("CLUSTER_ENDPOINT")
	if endpoint == "" {
		t.Skip("CLUSTER_ENDPOINT not set, skipping integration test")
	}

	// Create connection pool
	pool, err := dsql.NewPool(ctx, dsql.Config{
		Host: endpoint,
	})
	require.NoError(t, err)
	defer pool.Close()

	// Drop existing tables if they exist (for test repeatability)
	// Use retry logic as DSQL may have OCC conflicts after recent schema changes
	dropSQL := []string{
		"DROP TABLE IF EXISTS changelog",
		"DROP TABLE IF EXISTS assertion",
		"DROP TABLE IF EXISTS authorization_model",
		"DROP TABLE IF EXISTS store",
		"DROP TABLE IF EXISTS tuple",
	}

	for _, sql := range dropSQL {
		err := execWithRetry(ctx, pool, sql, 5)
		require.NoError(t, err, "Failed to drop table: %s", sql)
	}

	// Create OpenFGA schema (simplified version for testing)
	// Note: In production, use the actual OpenFGA migrate command with --datastore-engine=dsql
	// Use retry logic for OCC errors that may occur after schema changes
	createTableSQL := []string{
		`CREATE TABLE tuple (
			store TEXT NOT NULL,
			object_type TEXT NOT NULL,
			object_id TEXT NOT NULL,
			relation TEXT NOT NULL,
			_user TEXT NOT NULL,
			user_type TEXT NOT NULL,
			ulid TEXT NOT NULL,
			inserted_at TIMESTAMPTZ NOT NULL,
			condition_name TEXT,
			condition_context BYTEA,
			PRIMARY KEY (store, object_type, object_id, relation, _user)
		)`,
		`CREATE TABLE authorization_model (
			store TEXT NOT NULL,
			authorization_model_id TEXT NOT NULL,
			type TEXT NOT NULL,
			type_definition BYTEA,
			schema_version TEXT DEFAULT '1.0',
			serialized_protobuf BYTEA,
			PRIMARY KEY (store, authorization_model_id, type)
		)`,
		`CREATE TABLE store (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ,
			deleted_at TIMESTAMPTZ
		)`,
		`CREATE TABLE assertion (
			store TEXT NOT NULL,
			authorization_model_id TEXT NOT NULL,
			assertions BYTEA,
			PRIMARY KEY (store, authorization_model_id)
		)`,
		`CREATE TABLE changelog (
			store TEXT NOT NULL,
			object_type TEXT NOT NULL,
			object_id TEXT NOT NULL,
			relation TEXT NOT NULL,
			_user TEXT NOT NULL,
			operation INTEGER NOT NULL,
			ulid TEXT NOT NULL,
			inserted_at TIMESTAMPTZ NOT NULL,
			condition_name TEXT,
			condition_context BYTEA,
			PRIMARY KEY (store, ulid, object_type)
		)`,
	}

	for _, sql := range createTableSQL {
		err := execWithRetry(ctx, pool, sql, 5)
		require.NoError(t, err, "Failed to create table")
	}

	// Create indexes asynchronously (DSQL requirement)
	createIndexSQL := []string{
		"CREATE INDEX ASYNC idx_tuple_user ON tuple (store, object_type, object_id, relation, _user, user_type)",
		"CREATE UNIQUE INDEX ASYNC idx_tuple_ulid ON tuple (ulid)",
		"CREATE INDEX ASYNC idx_user_lookup ON tuple (store, _user, relation, object_type, object_id)",
	}

	for _, sql := range createIndexSQL {
		err := execWithRetry(ctx, pool, sql, 5)
		require.NoError(t, err, "Failed to create index: %s", sql)
	}

	t.Log("OpenFGA schema created successfully")
}

// TestOpenFGABasicOperations validates basic CRUD operations on OpenFGA tables
func TestOpenFGABasicOperations(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// Get cluster endpoint from environment
	endpoint := os.Getenv("CLUSTER_ENDPOINT")
	if endpoint == "" {
		t.Skip("CLUSTER_ENDPOINT not set, skipping integration test")
	}

	// Create connection pool
	pool, err := dsql.NewPool(ctx, dsql.Config{
		Host: endpoint,
	})
	require.NoError(t, err)
	defer pool.Close()

	// Test store creation
	storeID := fmt.Sprintf("test-store-%d", time.Now().UnixNano())
	_, err = pool.Exec(ctx,
		"INSERT INTO store (id, name, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())",
		storeID, "Test Store")
	require.NoError(t, err, "Failed to create store")

	// Verify store was created
	var name string
	err = pool.QueryRow(ctx, "SELECT name FROM store WHERE id = $1", storeID).Scan(&name)
	require.NoError(t, err, "Failed to query store")
	require.Equal(t, "Test Store", name)

	// Test tuple creation
	ulid := fmt.Sprintf("01H%d", time.Now().UnixNano())
	_, err = pool.Exec(ctx,
		`INSERT INTO tuple (store, object_type, object_id, relation, _user, user_type, ulid, inserted_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
		storeID, "document", "doc1", "viewer", "user:alice", "user", ulid)
	require.NoError(t, err, "Failed to create tuple")

	// Verify tuple was created
	var objectID string
	err = pool.QueryRow(ctx,
		"SELECT object_id FROM tuple WHERE store = $1 AND _user = $2",
		storeID, "user:alice").Scan(&objectID)
	require.NoError(t, err, "Failed to query tuple")
	require.Equal(t, "doc1", objectID)

	// Test SELECT ... FOR UPDATE (supported by DSQL with equality predicates on all key columns)
	// DSQL requires equality predicates on the entire primary key for FOR UPDATE
	// Primary key is: (store, object_type, object_id, relation, _user)
	tx, err := pool.Begin(ctx)
	require.NoError(t, err)

	var user string
	err = tx.QueryRow(ctx,
		"SELECT _user FROM tuple WHERE store = $1 AND object_type = $2 AND object_id = $3 AND relation = $4 AND _user = $5 FOR UPDATE",
		storeID, "document", "doc1", "viewer", "user:alice").Scan(&user)
	require.NoError(t, err, "Failed to SELECT FOR UPDATE")
	require.Equal(t, "user:alice", user)

	err = tx.Commit(ctx)
	require.NoError(t, err)

	// Cleanup
	_, err = pool.Exec(ctx, "DELETE FROM tuple WHERE store = $1", storeID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "DELETE FROM store WHERE id = $1", storeID)
	require.NoError(t, err)

	t.Log("OpenFGA basic operations test passed")
}

// TestOpenFGAWithConnectionString tests using the dsql:// connection string format
func TestOpenFGAWithConnectionString(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// Get cluster endpoint from environment
	endpoint := os.Getenv("CLUSTER_ENDPOINT")
	if endpoint == "" {
		t.Skip("CLUSTER_ENDPOINT not set, skipping integration test")
	}

	// Test dsql:// connection string format (as OpenFGA will use)
	connStr := fmt.Sprintf("dsql://admin@%s/postgres", endpoint)
	pool, err := dsql.NewPool(ctx, connStr)
	require.NoError(t, err)
	defer pool.Close()

	// Verify connection works
	var result int
	err = pool.QueryRow(ctx, "SELECT 1").Scan(&result)
	require.NoError(t, err)
	require.Equal(t, 1, result)

	t.Log("dsql:// connection string format works correctly")
}

// TestDSQLTokenGeneration tests token generation for database/sql use cases (migrations)
func TestDSQLTokenGeneration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Minute)
	defer cancel()

	// Get cluster endpoint from environment
	endpoint := os.Getenv("CLUSTER_ENDPOINT")
	if endpoint == "" {
		t.Skip("CLUSTER_ENDPOINT not set, skipping integration test")
	}

	// Test GenerateDBToken function (used by OpenFGA migrations)
	connStr := fmt.Sprintf("dsql://admin@%s/postgres", endpoint)
	token, err := dsql.GenerateDBToken(ctx, connStr)
	require.NoError(t, err)
	require.NotEmpty(t, token, "Generated token should not be empty")

	// Token should be a valid AWS signature (starts with the endpoint)
	require.Contains(t, token, endpoint, "Token should contain the endpoint")

	t.Log("Token generation for database/sql works correctly")
}

// TestOCCConflictHandling verifies that OCC conflicts are properly detected.
// This is important for OpenFGA because it skips FOR UPDATE on DSQL and relies
// on OCC to detect concurrent modifications at commit time.
func TestOCCConflictHandling(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	endpoint := os.Getenv("CLUSTER_ENDPOINT")
	if endpoint == "" {
		t.Skip("CLUSTER_ENDPOINT not set, skipping integration test")
	}

	pool, err := dsql.NewPool(ctx, dsql.Config{Host: endpoint})
	require.NoError(t, err)
	defer pool.Close()

	// Create test table
	tableName := fmt.Sprintf("occ_test_%d", time.Now().UnixNano())
	_, err = pool.Exec(ctx, fmt.Sprintf(`CREATE TABLE %s (
		id TEXT PRIMARY KEY,
		value INT NOT NULL
	)`, tableName))
	require.NoError(t, err)
	defer pool.Exec(ctx, fmt.Sprintf("DROP TABLE IF EXISTS %s", tableName))

	// Insert initial row
	_, err = pool.Exec(ctx, fmt.Sprintf("INSERT INTO %s (id, value) VALUES ('test', 0)", tableName))
	require.NoError(t, err)

	// Start two transactions
	tx1, err := pool.Begin(ctx)
	require.NoError(t, err)
	defer tx1.Rollback(ctx)

	tx2, err := pool.Begin(ctx)
	require.NoError(t, err)
	defer tx2.Rollback(ctx)

	// Both read the same row
	var v1, v2 int
	err = tx1.QueryRow(ctx, fmt.Sprintf("SELECT value FROM %s WHERE id = 'test'", tableName)).Scan(&v1)
	require.NoError(t, err)
	err = tx2.QueryRow(ctx, fmt.Sprintf("SELECT value FROM %s WHERE id = 'test'", tableName)).Scan(&v2)
	require.NoError(t, err)

	// Both try to update
	_, err = tx1.Exec(ctx, fmt.Sprintf("UPDATE %s SET value = $1 WHERE id = 'test'", tableName), v1+1)
	require.NoError(t, err)
	_, err = tx2.Exec(ctx, fmt.Sprintf("UPDATE %s SET value = $1 WHERE id = 'test'", tableName), v2+1)
	require.NoError(t, err)

	// First commit succeeds
	err = tx1.Commit(ctx)
	require.NoError(t, err)

	// Second commit should fail with OCC error
	err = tx2.Commit(ctx)
	require.Error(t, err, "Expected OCC error on second commit")
	require.True(t, isOCCError(err), "Expected OCC error, got: %v", err)

	t.Log("OCC conflict properly detected - DSQL's OCC provides conflict detection for OpenFGA")
}

// TestBatchOperationsNearLimit tests batch operations near the 3000 row limit.
// OpenFGA batches writes, so we verify that operations near the limit work correctly.
func TestBatchOperationsNearLimit(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	endpoint := os.Getenv("CLUSTER_ENDPOINT")
	if endpoint == "" {
		t.Skip("CLUSTER_ENDPOINT not set, skipping integration test")
	}

	pool, err := dsql.NewPool(ctx, dsql.Config{Host: endpoint})
	require.NoError(t, err)
	defer pool.Close()

	// Create test table
	tableName := fmt.Sprintf("batch_test_%d", time.Now().UnixNano())
	_, err = pool.Exec(ctx, fmt.Sprintf(`CREATE TABLE %s (
		id TEXT PRIMARY KEY,
		data TEXT
	)`, tableName))
	require.NoError(t, err)
	defer pool.Exec(ctx, fmt.Sprintf("DROP TABLE IF EXISTS %s", tableName))

	// Test batch insert of 2500 rows (under 3000 limit)
	batchSize := 2500
	tx, err := pool.Begin(ctx)
	require.NoError(t, err)

	for i := 0; i < batchSize; i++ {
		_, err = tx.Exec(ctx, fmt.Sprintf("INSERT INTO %s (id, data) VALUES ($1, $2)", tableName),
			fmt.Sprintf("id-%d", i), fmt.Sprintf("data-%d", i))
		require.NoError(t, err)
	}

	err = tx.Commit(ctx)
	require.NoError(t, err)

	// Verify count
	var count int
	err = pool.QueryRow(ctx, fmt.Sprintf("SELECT COUNT(*) FROM %s", tableName)).Scan(&count)
	require.NoError(t, err)
	require.Equal(t, batchSize, count)

	t.Logf("Batch insert of %d rows completed successfully", batchSize)
}
