/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package test

import (
	"os"
	"testing"

	example_preferred "github.com/aws-samples/aurora-dsql-samples/go/pgx/src"
)

func TestExamplePreferred(t *testing.T) {
	if os.Getenv("CLUSTER_ENDPOINT") == "" {
		t.Skip("CLUSTER_ENDPOINT required for integration test")
	}

	err := example_preferred.Example()
	if err != nil {
		t.Errorf("Example failed: %v", err)
	}
}
