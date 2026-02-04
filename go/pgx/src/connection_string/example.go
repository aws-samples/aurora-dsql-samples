/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Package connection_string demonstrates using connection strings with the DSQL connector.
//
// The DSQL connector supports PostgreSQL-style connection strings as an alternative
// to the Config struct. This is useful when:
//   - Configuration comes from environment variables or config files
//   - You want a single string for connection settings
//   - Migrating from other PostgreSQL tools that use connection strings
//
// Connection string format:
//
//	postgres://[user]@host[:port]/[database][?parameters]
//
// Supported parameters:
//   - region: AWS region (auto-detected from hostname if not provided)
//   - profile: AWS profile name for credentials
//   - tokenDurationSecs: Token validity duration in seconds
package connection_string

import (
	"context"
	"fmt"
	"os"

	"github.com/awslabs/aurora-dsql-connectors/go/pgx/dsql"
)

func demonstrateBasicConnectionString(ctx context.Context, endpoint, user string) error {
	fmt.Println("1. Basic connection string:")
	fmt.Println("   Format: postgres://<user>@<endpoint>/postgres")

	connStr := fmt.Sprintf("postgres://%s@%s/postgres", user, endpoint)
	fmt.Printf("   Using: %s\n", connStr)

	pool, err := dsql.NewPool(ctx, connStr)
	if err != nil {
		return fmt.Errorf("failed to create pool: %w", err)
	}
	defer pool.Close()

	var result int
	if err := pool.QueryRow(ctx, "SELECT 1").Scan(&result); err != nil {
		return fmt.Errorf("query failed: %w", err)
	}
	fmt.Printf("   Query result: %d\n", result)
	fmt.Println("   Success!")
	return nil
}

func demonstrateWithRegion(ctx context.Context, endpoint, user, region string) error {
	fmt.Println("\n2. Connection string with explicit region:")
	fmt.Println("   Format: postgres://<user>@<endpoint>/postgres?region=<region>")

	connStr := fmt.Sprintf("postgres://%s@%s/postgres?region=%s", user, endpoint, region)
	fmt.Printf("   Using: %s\n", connStr)

	pool, err := dsql.NewPool(ctx, connStr)
	if err != nil {
		return fmt.Errorf("failed to create pool: %w", err)
	}
	defer pool.Close()

	var result int
	if err := pool.QueryRow(ctx, "SELECT 1").Scan(&result); err != nil {
		return fmt.Errorf("query failed: %w", err)
	}
	fmt.Printf("   Query result: %d\n", result)
	fmt.Println("   Success!")
	return nil
}

func demonstrateWithTokenDuration(ctx context.Context, endpoint, user string) error {
	fmt.Println("\n3. Connection string with custom token duration:")
	fmt.Println("   Format: postgres://<user>@<endpoint>/postgres?tokenDurationSecs=900")

	connStr := fmt.Sprintf("postgres://%s@%s/postgres?tokenDurationSecs=900", user, endpoint)
	fmt.Printf("   Using: %s\n", connStr)

	pool, err := dsql.NewPool(ctx, connStr)
	if err != nil {
		return fmt.Errorf("failed to create pool: %w", err)
	}
	defer pool.Close()

	var result int
	if err := pool.QueryRow(ctx, "SELECT 1").Scan(&result); err != nil {
		return fmt.Errorf("query failed: %w", err)
	}
	fmt.Printf("   Query result: %d\n", result)
	fmt.Println("   Success!")
	return nil
}

func demonstrateWithCustomPort(ctx context.Context, endpoint, user string) error {
	fmt.Println("\n4. Connection string with custom port:")
	fmt.Println("   Format: postgres://<user>@<endpoint>:5432/postgres")

	connStr := fmt.Sprintf("postgres://%s@%s:5432/postgres", user, endpoint)
	fmt.Printf("   Using: %s\n", connStr)

	pool, err := dsql.NewPool(ctx, connStr)
	if err != nil {
		return fmt.Errorf("failed to create pool: %w", err)
	}
	defer pool.Close()

	var result int
	if err := pool.QueryRow(ctx, "SELECT 1").Scan(&result); err != nil {
		return fmt.Errorf("query failed: %w", err)
	}
	fmt.Printf("   Query result: %d\n", result)
	fmt.Println("   Success!")
	return nil
}

func demonstrateSingleConnection(ctx context.Context, endpoint, user string) error {
	fmt.Println("\n5. Single connection (no pool) with connection string:")
	fmt.Println("   Using dsql.Connect() instead of dsql.NewPool()")

	connStr := fmt.Sprintf("postgres://%s@%s/postgres", user, endpoint)
	fmt.Printf("   Using: %s\n", connStr)

	conn, err := dsql.Connect(ctx, connStr)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}
	defer conn.Close(ctx)

	var result int
	if err := conn.QueryRow(ctx, "SELECT 1").Scan(&result); err != nil {
		return fmt.Errorf("query failed: %w", err)
	}
	fmt.Printf("   Query result: %d\n", result)
	fmt.Println("   Success!")
	return nil
}

func demonstrateMultipleParameters(ctx context.Context, endpoint, user, region string) error {
	fmt.Println("\n6. Connection string with multiple parameters:")
	fmt.Println("   Format: postgres://<user>@<endpoint>/postgres?region=<region>&tokenDurationSecs=600")

	connStr := fmt.Sprintf("postgres://%s@%s/postgres?region=%s&tokenDurationSecs=600", user, endpoint, region)
	fmt.Printf("   Using: %s\n", connStr)

	pool, err := dsql.NewPool(ctx, connStr)
	if err != nil {
		return fmt.Errorf("failed to create pool: %w", err)
	}
	defer pool.Close()

	var result int
	if err := pool.QueryRow(ctx, "SELECT 1").Scan(&result); err != nil {
		return fmt.Errorf("query failed: %w", err)
	}
	fmt.Printf("   Query result: %d\n", result)
	fmt.Println("   Success!")
	return nil
}

// Example demonstrates various connection string formats with the DSQL connector.
func Example() error {
	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	if clusterEndpoint == "" {
		return fmt.Errorf("CLUSTER_ENDPOINT environment variable is not set")
	}

	// Get user from CLUSTER_USER env var, default to "admin"
	user := os.Getenv("CLUSTER_USER")
	if user == "" {
		user = "admin"
	}

	region := os.Getenv("AWS_REGION")
	if region == "" {
		region = os.Getenv("AWS_DEFAULT_REGION")
	}
	if region == "" {
		region = "us-east-1"
	}

	ctx := context.Background()

	fmt.Println("Connection String Examples")
	fmt.Println("==========================")
	fmt.Println()
	fmt.Println("The DSQL connector accepts PostgreSQL-style connection strings.")
	fmt.Println("These examples show various formats and parameters.")
	fmt.Println()

	if err := demonstrateBasicConnectionString(ctx, clusterEndpoint, user); err != nil {
		return err
	}

	if err := demonstrateWithRegion(ctx, clusterEndpoint, user, region); err != nil {
		return err
	}

	if err := demonstrateWithTokenDuration(ctx, clusterEndpoint, user); err != nil {
		return err
	}

	if err := demonstrateWithCustomPort(ctx, clusterEndpoint, user); err != nil {
		return err
	}

	if err := demonstrateSingleConnection(ctx, clusterEndpoint, user); err != nil {
		return err
	}

	if err := demonstrateMultipleParameters(ctx, clusterEndpoint, user, region); err != nil {
		return err
	}

	fmt.Println()
	fmt.Println("Connection string example completed successfully!")
	fmt.Println()
	fmt.Println("Summary of supported parameters:")
	fmt.Println("  - region: AWS region (auto-detected from hostname if omitted)")
	fmt.Println("  - profile: AWS profile name for credentials")
	fmt.Println("  - tokenDurationSecs: IAM token validity in seconds")

	return nil
}
