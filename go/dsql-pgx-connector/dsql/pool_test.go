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

func TestNewPoolNilConfig(t *testing.T) {
	ctx := context.Background()
	var nilConfig *Config = nil
	_, err := NewPool(ctx, nilConfig)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "config cannot be nil")
}

func TestNewPool(t *testing.T) {
	endpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")
	if endpoint == "" || region == "" {
		t.Skip("CLUSTER_ENDPOINT and REGION required for pool test")
	}

	ctx := context.Background()

	pool, err := NewPool(ctx, Config{
		Host:   endpoint,
		Region: region,
	})
	require.NoError(t, err)
	defer pool.Close()

	// Verify connection works
	err = pool.Ping(ctx)
	assert.NoError(t, err)
}

func TestNewPoolFromConnectionString(t *testing.T) {
	endpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")
	if endpoint == "" || region == "" {
		t.Skip("CLUSTER_ENDPOINT and REGION required for pool test")
	}

	ctx := context.Background()
	connStr := "postgres://admin@" + endpoint + "/postgres?region=" + region

	pool, err := NewPool(ctx, connStr)
	require.NoError(t, err)
	defer pool.Close()

	// Verify connection works
	err = pool.Ping(ctx)
	assert.NoError(t, err)
}

func TestPoolQuery(t *testing.T) {
	endpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")
	if endpoint == "" || region == "" {
		t.Skip("CLUSTER_ENDPOINT and REGION required for pool test")
	}

	ctx := context.Background()

	pool, err := NewPool(ctx, Config{
		Host:   endpoint,
		Region: region,
	})
	require.NoError(t, err)
	defer pool.Close()

	var result int
	err = pool.QueryRow(ctx, "SELECT 1").Scan(&result)
	require.NoError(t, err)
	assert.Equal(t, 1, result)
}

func TestPoolWithCustomConfig(t *testing.T) {
	endpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")
	if endpoint == "" || region == "" {
		t.Skip("CLUSTER_ENDPOINT and REGION required for pool test")
	}

	ctx := context.Background()

	pool, err := NewPool(ctx, Config{
		Host:     endpoint,
		Region:   region,
		MaxConns: 5,
		MinConns: 1,
	})
	require.NoError(t, err)
	defer pool.Close()

	// Verify pool config
	poolConfig := pool.Config()
	assert.Equal(t, int32(5), poolConfig.MaxConns)
	assert.Equal(t, int32(1), poolConfig.MinConns)
}
