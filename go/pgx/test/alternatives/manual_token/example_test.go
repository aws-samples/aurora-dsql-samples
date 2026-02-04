/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package manual_token_test

import (
	"os"
	"testing"

	manual_token "github.com/aws-samples/aurora-dsql-samples/go/pgx/src/alternatives/manual_token"
)

func TestManualTokenExample(t *testing.T) {
	if os.Getenv("CLUSTER_ENDPOINT") == "" {
		t.Skip("CLUSTER_ENDPOINT required for integration test")
	}

	err := manual_token.Example()
	if err != nil {
		t.Errorf("Example failed: %v", err)
	}
}
