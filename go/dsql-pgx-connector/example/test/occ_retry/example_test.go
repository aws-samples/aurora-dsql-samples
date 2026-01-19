/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package occ_retry_test

import (
	"os"
	"testing"

	"github.com/aws-samples/aurora-dsql-samples/go/dsql-pgx-connector/example/src/occ_retry"
	"github.com/aws-samples/aurora-dsql-samples/go/dsql-pgx-connector/occretry"
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
	// Test the canonical occretry.IsOCCError function
	if occretry.IsOCCError(nil) {
		t.Error("IsOCCError should return false for nil")
	}

	if occretry.IsOCCError(os.ErrNotExist) {
		t.Error("IsOCCError should return false for non-OCC errors")
	}
}
