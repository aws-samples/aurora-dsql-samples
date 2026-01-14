/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package pgadapter

import (
	"context"
	"testing"
	"time"

	"github.com/aws-samples/aurora-dsql-samples/go/dsql-pgx-connector/dsql"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockCredentialsProvider is a test credentials provider
type mockCredentialsProvider struct{}

func (m mockCredentialsProvider) Retrieve(ctx context.Context) (aws.Credentials, error) {
	return aws.Credentials{
		AccessKeyID:     "test-access-key",
		SecretAccessKey: "test-secret-key",
	}, nil
}

func TestNewWithValidConfig(t *testing.T) {
	cfg := Config{
		DSQLEndpoint:              "mycluster.dsql.us-east-1.on.aws",
		CustomCredentialsProvider: mockCredentialsProvider{},
	}

	adapter, err := New(cfg)
	require.NoError(t, err)
	require.NotNil(t, adapter)

	assert.Equal(t, "mycluster.dsql.us-east-1.on.aws", adapter.config.dsqlEndpoint)
	assert.Equal(t, "us-east-1", adapter.config.region)
	assert.Equal(t, DefaultListenAddr, adapter.config.listenAddr)
	assert.Equal(t, dsql.DefaultUser, adapter.config.defaultUser)
	assert.Equal(t, dsql.DefaultDatabase, adapter.config.defaultDatabase)
	assert.Equal(t, DefaultDSQLPort, adapter.config.dsqlPort)
	assert.Equal(t, int64(dsql.DefaultTokenDuration), adapter.config.tokenDuration)
}

func TestNewMissingEndpoint(t *testing.T) {
	cfg := Config{}

	adapter, err := New(cfg)
	assert.Error(t, err)
	assert.Nil(t, adapter)
	assert.Contains(t, err.Error(), "DSQLEndpoint is required")
}

func TestNewInvalidEndpoint(t *testing.T) {
	cfg := Config{
		DSQLEndpoint:              "invalid-endpoint",
		CustomCredentialsProvider: mockCredentialsProvider{},
	}

	adapter, err := New(cfg)
	assert.Error(t, err)
	assert.Nil(t, adapter)
	assert.Contains(t, err.Error(), "could not parse region from endpoint")
}

func TestNewWithCustomConfig(t *testing.T) {
	cfg := Config{
		DSQLEndpoint:              "mycluster.dsql.eu-west-1.on.aws",
		Region:                    "eu-west-1",
		ListenAddr:                "0.0.0.0:15432",
		DefaultUser:               "myuser",
		DefaultDatabase:           "mydb",
		DSQLPort:                  5433,
		TokenDuration:             10 * time.Minute,
		CustomCredentialsProvider: mockCredentialsProvider{},
	}

	adapter, err := New(cfg)
	require.NoError(t, err)
	require.NotNil(t, adapter)

	assert.Equal(t, "mycluster.dsql.eu-west-1.on.aws", adapter.config.dsqlEndpoint)
	assert.Equal(t, "eu-west-1", adapter.config.region)
	assert.Equal(t, "0.0.0.0:15432", adapter.config.listenAddr)
	assert.Equal(t, "myuser", adapter.config.defaultUser)
	assert.Equal(t, "mydb", adapter.config.defaultDatabase)
	assert.Equal(t, 5433, adapter.config.dsqlPort)
	assert.Equal(t, int64(10*time.Minute), adapter.config.tokenDuration)
}

func TestNewWithExplicitRegionOverride(t *testing.T) {
	// When Region is explicitly provided, it should be used even if
	// it differs from what could be parsed from the endpoint
	cfg := Config{
		DSQLEndpoint:              "mycluster.dsql.us-east-1.on.aws",
		Region:                    "us-west-2", // Explicitly override
		CustomCredentialsProvider: mockCredentialsProvider{},
	}

	adapter, err := New(cfg)
	require.NoError(t, err)
	require.NotNil(t, adapter)

	// Explicit region should take precedence
	assert.Equal(t, "us-west-2", adapter.config.region)
}
