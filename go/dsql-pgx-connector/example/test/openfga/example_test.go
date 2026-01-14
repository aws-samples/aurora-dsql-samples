/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package openfga_test

import (
	"os"
	"testing"

	openfga "github.com/aws-samples/aurora-dsql-samples/go/dsql-pgx-connector/example/src/openfga"
)

func TestOpenFGAIntegration(t *testing.T) {
	if os.Getenv("CLUSTER_ENDPOINT") == "" {
		t.Skip("CLUSTER_ENDPOINT required for integration test")
	}

	err := openfga.Example()
	if err != nil {
		t.Errorf("OpenFGA integration test failed: %v", err)
	}
}
