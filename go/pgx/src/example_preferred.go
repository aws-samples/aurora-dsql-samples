/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Package example_preferred demonstrates concurrent queries using the DSQL connector pool.
//
// Works with both admin and non-admin users:
//   - Admin users operate in the default "public" schema
//   - Non-admin users operate in a custom "myschema" schema
package example_preferred

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"

	"github.com/awslabs/aurora-dsql-connectors/go/pgx/dsql"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const numConcurrentQueries = 8

func createPool(ctx context.Context, clusterEndpoint, clusterUser string) (*pgxpool.Pool, error) {
	poolCfg, _ := pgxpool.ParseConfig("")
	poolCfg.MaxConns = 10
	poolCfg.MinConns = 2

	// Set search_path on each new connection based on user type
	var schema string
	if clusterUser == "admin" {
		schema = "public"
	} else {
		schema = "myschema"
	}
	poolCfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, fmt.Sprintf("SET search_path = %s", pgx.Identifier{schema}.Sanitize()))
		if err != nil {
			return fmt.Errorf("failed to set search_path to %s: %w", schema, err)
		}
		return nil
	}

	return dsql.NewPool(ctx, dsql.Config{
		Host: clusterEndpoint,
		User: clusterUser,
	}, poolCfg)
}

// workerResult holds either a successful result or an error from a worker.
type workerResult struct {
	workerID int
	result   string
	err      error
}

func worker(ctx context.Context, pool *pgxpool.Pool, workerID int) workerResult {
	var result int
	err := pool.QueryRow(ctx, "SELECT $1::int as worker_id", workerID).Scan(&result)
	if err != nil {
		return workerResult{workerID: workerID, err: fmt.Errorf("worker %d error: %w", workerID, err)}
	}
	return workerResult{workerID: workerID, result: fmt.Sprintf("Worker %d result: %d", workerID, result)}
}

// Example demonstrates concurrent queries using the DSQL connector pool.
func Example() error {
	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	if clusterEndpoint == "" {
		return fmt.Errorf("CLUSTER_ENDPOINT environment variable is not set")
	}
	clusterUser := os.Getenv("CLUSTER_USER")
	if clusterUser == "" {
		clusterUser = "admin"
	}

	ctx := context.Background()

	pool, err := createPool(ctx, clusterEndpoint, clusterUser)
	if err != nil {
		return fmt.Errorf("failed to create pool: %w", err)
	}
	defer pool.Close()

	// Verify connection
	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("failed to ping: %w", err)
	}

	// Run concurrent queries using the connection pool
	results := make(chan workerResult, numConcurrentQueries)

	var wg sync.WaitGroup
	for i := 1; i <= numConcurrentQueries; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			results <- worker(ctx, pool, workerID)
		}(i)
	}

	// Wait for all workers to complete and close the channel
	wg.Wait()
	close(results)

	// Collect results and errors
	var errs []error
	for res := range results {
		if res.err != nil {
			errs = append(errs, res.err)
		} else {
			fmt.Println(res.result)
		}
	}

	// Return combined errors if any occurred
	if len(errs) > 0 {
		return errors.Join(errs...)
	}

	fmt.Println("Connection pool with concurrent connections exercised successfully")
	return nil
}
