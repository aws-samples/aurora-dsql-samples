/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Package example_preferred demonstrates concurrent queries using the DSQL connector pool.
package example_preferred

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"

	"github.com/awslabs/aurora-dsql-connectors/go/pgx/dsql"
)

const numConcurrentQueries = 8

func createPool(ctx context.Context, clusterEndpoint string) (*dsql.Pool, error) {
	return dsql.NewPool(ctx, dsql.Config{
		Host:     clusterEndpoint,
		MaxConns: 10,
		MinConns: 2,
	})
}

// workerResult holds either a successful result or an error from a worker.
type workerResult struct {
	workerID int
	result   string
	err      error
}

func worker(ctx context.Context, pool *dsql.Pool, workerID int) workerResult {
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

	ctx := context.Background()

	pool, err := createPool(ctx, clusterEndpoint)
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
