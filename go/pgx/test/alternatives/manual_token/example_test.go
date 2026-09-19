/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package manual_token_test

import (
	"context"
	"os"
	"testing"

	manual_token "github.com/aws-samples/aurora-dsql-samples/go/pgx/src/alternatives/manual_token"
	"github.com/awslabs/aurora-dsql-connectors/go/pgx/occretry"
)

func TestManualTokenExample(t *testing.T) {
	if os.Getenv("CLUSTER_ENDPOINT") == "" {
		t.Skip("CLUSTER_ENDPOINT required for integration test")
	}

	ctx := context.Background()
	pool, cancel, err := manual_token.NewPool(ctx)
	if err != nil {
		t.Fatalf("Unable to create setup pool: %v", err)
	}
	t.Cleanup(func() {
		pool.Close()
		cancel()
	})

	retryConfig := occretry.DefaultConfig()
	err = occretry.Retry(ctx, retryConfig, func() error {
		_, execErr := pool.Exec(ctx, `
			CREATE TABLE IF NOT EXISTS owner (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				name VARCHAR(255),
				city VARCHAR(255),
				telephone VARCHAR(255)
			)
		`)
		return execErr
	})
	if err != nil {
		t.Fatalf("Unable to create owner table: %v", err)
	}

	var existingOwnerID string
	err = occretry.Retry(ctx, retryConfig, func() error {
		return pool.QueryRow(ctx, `
			INSERT INTO owner (name, city, telephone)
			VALUES ($1, $2, NULL)
			RETURNING id
		`, "John Doe", "Existing City").Scan(&existingOwnerID)
	})
	if err != nil {
		t.Fatalf("Unable to insert existing owner: %v", err)
	}
	t.Cleanup(func() {
		cleanupErr := occretry.Retry(ctx, retryConfig, func() error {
			_, execErr := pool.Exec(ctx, `DELETE FROM owner WHERE id = $1`, existingOwnerID)
			return execErr
		})
		if cleanupErr != nil {
			t.Errorf("Unable to clean existing owner: %v", cleanupErr)
		}
	})

	var exampleOwnerCountBefore int
	err = pool.QueryRow(ctx, `
		SELECT count(*)
		FROM owner
		WHERE name = $1 AND city = $2 AND telephone = $3
	`, "John Doe", "Anytown", "555-555-0150").Scan(&exampleOwnerCountBefore)
	if err != nil {
		t.Fatalf("Unable to count example owners before run: %v", err)
	}

	err = manual_token.Example()
	if err != nil {
		t.Fatalf("Example failed: %v", err)
	}

	var exampleOwnerCountAfter int
	err = pool.QueryRow(ctx, `
		SELECT count(*)
		FROM owner
		WHERE name = $1 AND city = $2 AND telephone = $3
	`, "John Doe", "Anytown", "555-555-0150").Scan(&exampleOwnerCountAfter)
	if err != nil {
		t.Fatalf("Unable to count example owners after run: %v", err)
	}
	if exampleOwnerCountAfter != exampleOwnerCountBefore {
		t.Errorf(
			"Expected example to clean its inserted owner; count changed from %d to %d",
			exampleOwnerCountBefore,
			exampleOwnerCountAfter,
		)
	}

	var existingOwnerCount int
	err = pool.QueryRow(ctx, `SELECT count(*) FROM owner WHERE id = $1`, existingOwnerID).Scan(&existingOwnerCount)
	if err != nil {
		t.Fatalf("Unable to verify existing owner: %v", err)
	}
	if existingOwnerCount != 1 {
		t.Errorf("Expected existing owner to remain, found %d rows", existingOwnerCount)
	}
}
