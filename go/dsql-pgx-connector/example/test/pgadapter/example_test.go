/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package pgadapter_test

import (
	"context"
	"fmt"
	"math/rand"
	"net"
	"os"
	"testing"
	"time"

	"github.com/aws-samples/aurora-dsql-samples/go/dsql-pgx-connector/pgadapter"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPgAdapterE2E(t *testing.T) {
	endpoint := os.Getenv("CLUSTER_ENDPOINT")
	if endpoint == "" {
		t.Skip("CLUSTER_ENDPOINT required for integration test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Create adapter with random port
	adapter, err := pgadapter.New(pgadapter.Config{
		DSQLEndpoint: endpoint,
		ListenAddr:   "127.0.0.1:0",
	})
	require.NoError(t, err, "failed to create adapter")

	// Start adapter in background
	adapterErr := make(chan error, 1)
	go func() {
		adapterErr <- adapter.ListenAndServe(ctx)
	}()

	// Poll for adapter to be ready (up to 5 seconds)
	var adapterAddr string
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		adapterAddr = adapter.Addr()
		if adapterAddr != "" {
			// Try to connect to verify it's accepting connections
			conn, err := net.DialTimeout("tcp", adapterAddr, 100*time.Millisecond)
			if err == nil {
				conn.Close()
				break
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	require.NotEmpty(t, adapterAddr, "adapter did not start within 5 seconds")

	// Connect using standard pgx (simulates OpenFGA or other PostgreSQL clients)
	connStr := fmt.Sprintf("postgres://admin:unused@%s/postgres?sslmode=disable", adapterAddr)
	conn, err := pgx.Connect(ctx, connStr)
	require.NoError(t, err, "failed to connect to adapter")
	defer conn.Close(ctx)

	// Test 1: SELECT 1
	var one int
	err = conn.QueryRow(ctx, "SELECT 1").Scan(&one)
	require.NoError(t, err, "SELECT 1 failed")
	assert.Equal(t, 1, one)

	// Test 2: Create table with random suffix
	tableName := fmt.Sprintf("pgadapter_test_%d", rand.Int63())
	_, err = conn.Exec(ctx, fmt.Sprintf(`CREATE TABLE %s (
		id INT PRIMARY KEY,
		name TEXT NOT NULL
	)`, tableName))
	require.NoError(t, err, "CREATE TABLE failed")

	// Test 3: Insert data
	_, err = conn.Exec(ctx, fmt.Sprintf("INSERT INTO %s (id, name) VALUES ($1, $2)", tableName), 1, "test")
	require.NoError(t, err, "INSERT failed")

	// Test 4: Select data
	var id int
	var name string
	err = conn.QueryRow(ctx, fmt.Sprintf("SELECT id, name FROM %s WHERE id = $1", tableName), 1).Scan(&id, &name)
	require.NoError(t, err, "SELECT failed")
	assert.Equal(t, 1, id)
	assert.Equal(t, "test", name)

	// Test 5: Drop table (cleanup)
	_, err = conn.Exec(ctx, fmt.Sprintf("DROP TABLE %s", tableName))
	require.NoError(t, err, "DROP TABLE failed")

	// Clean shutdown
	conn.Close(ctx)
	err = adapter.Close()
	require.NoError(t, err, "adapter close failed")

	// Check adapter didn't error
	select {
	case err := <-adapterErr:
		require.NoError(t, err, "adapter encountered an error")
	default:
		// Adapter still running is fine, Close() will stop it
	}
}
