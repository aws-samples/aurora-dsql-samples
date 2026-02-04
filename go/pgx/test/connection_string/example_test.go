/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package connection_string_test

import (
	"os"
	"testing"

	"github.com/aws-samples/aurora-dsql-samples/go/pgx/src/connection_string"
)

func TestConnectionStringExample(t *testing.T) {
	if os.Getenv("CLUSTER_ENDPOINT") == "" {
		t.Skip("CLUSTER_ENDPOINT required for integration test")
	}

	err := connection_string.Example()
	if err != nil {
		t.Errorf("Connection string example failed: %v", err)
	}
}
