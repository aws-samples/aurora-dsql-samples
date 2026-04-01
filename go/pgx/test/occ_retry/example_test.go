/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package occ_retry_test

import (
	"errors"
	"fmt"
	"os"
	"testing"

	"github.com/aws-samples/aurora-dsql-samples/go/pgx/src/occ_retry"
	"github.com/awslabs/aurora-dsql-connectors/go/pgx/occretry"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestOCCRetryExample(t *testing.T) {
	if os.Getenv("CLUSTER_ENDPOINT") == "" {
		t.Skip("CLUSTER_ENDPOINT required for integration test")
	}

	err := occ_retry.Example()
	if err != nil {
		t.Errorf("OCC retry example failed: %v", err)
	}
}

func TestIsOCCError(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{
			name:     "nil error",
			err:      nil,
			expected: false,
		},
		{
			name:     "non-OCC error",
			err:      os.ErrNotExist,
			expected: false,
		},
		{
			name:     "generic error",
			err:      errors.New("some random error"),
			expected: false,
		},
		{
			name: "OC000 mutation conflict",
			err: &pgconn.PgError{
				Code:    "OC000",
				Message: "transaction conflict detected",
			},
			expected: true,
		},
		{
			name: "OC001 schema conflict",
			err: &pgconn.PgError{
				Code:    "OC001",
				Message: "schema changed during transaction",
			},
			expected: true,
		},
		{
			name: "SQLSTATE 40001 serialization failure",
			err: &pgconn.PgError{
				Code:    "40001",
				Message: "could not serialize access",
			},
			expected: true,
		},
		{
			name: "different SQLSTATE",
			err: &pgconn.PgError{
				Code:    "23505",
				Message: "unique violation",
			},
			expected: false,
		},
		{
			name:     "plain error with OCC code in message is not detected",
			err:      errors.New("query failed: OC000 conflict"),
			expected: false,
		},
		{
			name: "wrapped PgError is detected",
			err:  fmt.Errorf("query failed: %w", &pgconn.PgError{Code: "OC000"}),
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := occretry.IsOCCError(tt.err)
			if result != tt.expected {
				t.Errorf("IsOCCError(%v) = %v, expected %v", tt.err, result, tt.expected)
			}
		})
	}
}
