/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Package example_preferred demonstrates concurrent queries using the DSQL connector pool.
package example_preferred

import (
	"context"
	"fmt"
	"os"
	"sync"

	"github.com/aws-samples/aurora-dsql-samples/go/dsql-pgx-connector/dsql"
)

const numConcurrentQueries = 8

func createPool(ctx context.Context, clusterEndpoint string) (*dsql.Pool, error) {
	return dsql.NewPool(ctx, dsql.Config{
		Host:     clusterEndpoint,
		MaxConns: 10,
		MinConns: 2,
	})
}

func worker(ctx context.Context, pool *dsql.Pool, workerID int, results chan<- string, errors chan<- error) {
	var result int
	err := pool.QueryRow(ctx, "SELECT $1::int as worker_id", workerID).Scan(&result)
	if err != nil {
		errors <- fmt.Errorf("worker %d error: %w", workerID, err)
		return
	}
	results <- fmt.Sprintf("Worker %d result: %d", workerID, result)
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
	results := make(chan string, numConcurrentQueries)
	errors := make(chan error, numConcurrentQueries)

	var wg sync.WaitGroup
	for i := 1; i <= numConcurrentQueries; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			worker(ctx, pool, workerID, results, errors)
		}(i)
	}

	// Wait for all workers to complete
	wg.Wait()
	close(results)
	close(errors)

	// Check for errors
	for err := range errors {
		return err
	}

	// Print results
	for result := range results {
		fmt.Println(result)
	}

	fmt.Println("Connection pool with concurrent connections exercised successfully")
	return nil
}
