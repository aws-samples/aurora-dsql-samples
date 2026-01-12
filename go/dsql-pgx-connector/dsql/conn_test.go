/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package dsql

import (
	"context"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConnectNilConfig(t *testing.T) {
	ctx := context.Background()
	var nilConfig *Config = nil
	_, err := Connect(ctx, nilConfig)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "config cannot be nil")
}

func TestConnect(t *testing.T) {
	endpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")
	if endpoint == "" || region == "" {
		t.Skip("CLUSTER_ENDPOINT and REGION required for connection test")
	}

	ctx := context.Background()

	conn, err := Connect(ctx, Config{
		Host:   endpoint,
		Region: region,
	})
	require.NoError(t, err)
	defer conn.Close(ctx)

	// Verify connection works
	var result int
	err = conn.QueryRow(ctx, "SELECT 1").Scan(&result)
	require.NoError(t, err)
	assert.Equal(t, 1, result)
}

func TestConnectFromConnectionString(t *testing.T) {
	endpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")
	if endpoint == "" || region == "" {
		t.Skip("CLUSTER_ENDPOINT and REGION required for connection test")
	}

	ctx := context.Background()
	connStr := "postgres://admin@" + endpoint + "/postgres?region=" + region

	conn, err := Connect(ctx, connStr)
	require.NoError(t, err)
	defer conn.Close(ctx)

	// Verify connection works
	var result int
	err = conn.QueryRow(ctx, "SELECT 1").Scan(&result)
	require.NoError(t, err)
	assert.Equal(t, 1, result)
}
