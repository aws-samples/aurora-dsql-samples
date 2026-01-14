/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package occ_retry_test

import (
	"os"
	"testing"

	"github.com/aws-samples/aurora-dsql-samples/go/dsql-pgx-connector/example/src/occ_retry"
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
	if occ_retry.IsOCCError(nil) {
		t.Error("IsOCCError should return false for nil")
	}

	if occ_retry.IsOCCError(os.ErrNotExist) {
		t.Error("IsOCCError should return false for non-OCC errors")
	}
}
