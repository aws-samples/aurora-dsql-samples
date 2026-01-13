/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package dsql

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenerateToken(t *testing.T) {
	// Skip if no credentials available (unit test environment)
	endpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")
	if endpoint == "" || region == "" {
		t.Skip("CLUSTER_ENDPOINT and REGION required for token generation test")
	}

	ctx := context.Background()

	t.Run("admin user", func(t *testing.T) {
		token, err := GenerateToken(ctx, endpoint, region, "admin", nil, 0)
		require.NoError(t, err)
		assert.NotEmpty(t, token)
	})

	t.Run("non-admin user", func(t *testing.T) {
		token, err := GenerateToken(ctx, endpoint, region, "myuser", nil, 0)
		require.NoError(t, err)
		assert.NotEmpty(t, token)
	})

	t.Run("with custom expiry", func(t *testing.T) {
		token, err := GenerateToken(ctx, endpoint, region, "admin", nil, 60*time.Second)
		require.NoError(t, err)
		assert.NotEmpty(t, token)
	})
}
