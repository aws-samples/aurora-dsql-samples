// cleanup_dsql.go - Clean up DSQL tables before running OpenFGA migrations
// This script drops all OpenFGA-related tables to ensure a clean migration state.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/aws-samples/aurora-dsql-samples/go/dsql-pgx-connector/dsql"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	endpoint := os.Getenv("CLUSTER_ENDPOINT")
	if endpoint == "" {
		log.Fatal("CLUSTER_ENDPOINT environment variable is required")
	}

	connStr := fmt.Sprintf("postgres://admin@%s/postgres", endpoint)
	pool, err := dsql.NewPool(ctx, connStr)
	if err != nil {
		log.Fatalf("Failed to connect to DSQL: %v", err)
	}
	defer pool.Close()

	// Drop OpenFGA tables in reverse dependency order
	tables := []string{
		"changelog",
		"assertion",
		"tuple",
		"authorization_model",
		"store",
		"goose_db_version",
	}

	for _, table := range tables {
		_, err := pool.Exec(ctx, fmt.Sprintf("DROP TABLE IF EXISTS %s", table))
		if err != nil {
			log.Printf("Warning: Failed to drop table %s: %v", table, err)
		} else {
			log.Printf("Dropped table %s (if existed)", table)
		}
	}

	log.Println("DSQL cleanup completed successfully")
}
