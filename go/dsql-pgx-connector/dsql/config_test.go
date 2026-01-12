/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package dsql

import (
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConfigDefaults(t *testing.T) {
	cfg := Config{
		Host: "cluster.dsql.us-east-1.on.aws",
	}

	resolved, err := cfg.resolve()
	require.NoError(t, err)

	assert.Equal(t, "cluster.dsql.us-east-1.on.aws", resolved.Host)
	assert.Equal(t, "us-east-1", resolved.Region)
	assert.Equal(t, "admin", resolved.User)
	assert.Equal(t, "postgres", resolved.Database)
	assert.Equal(t, 5432, resolved.Port)
}

func TestConfigExplicitRegion(t *testing.T) {
	cfg := Config{
		Host:   "cluster.dsql.us-east-1.on.aws",
		Region: "eu-west-1", // Override parsed region
	}

	resolved, err := cfg.resolve()
	require.NoError(t, err)

	assert.Equal(t, "eu-west-1", resolved.Region)
}

func TestConfigClusterID(t *testing.T) {
	cfg := Config{
		Host:   "mycluster",
		Region: "us-west-2",
	}

	resolved, err := cfg.resolve()
	require.NoError(t, err)

	assert.Equal(t, "mycluster.dsql.us-west-2.on.aws", resolved.Host)
	assert.Equal(t, "us-west-2", resolved.Region)
}

func TestConfigClusterIDWithoutRegion(t *testing.T) {
	// Clear any environment region
	oldRegion := os.Getenv("AWS_REGION")
	oldDefaultRegion := os.Getenv("AWS_DEFAULT_REGION")
	os.Unsetenv("AWS_REGION")
	os.Unsetenv("AWS_DEFAULT_REGION")
	defer func() {
		if oldRegion != "" {
			os.Setenv("AWS_REGION", oldRegion)
		}
		if oldDefaultRegion != "" {
			os.Setenv("AWS_DEFAULT_REGION", oldDefaultRegion)
		}
	}()

	cfg := Config{
		Host: "mycluster", // No region, can't parse from cluster ID
	}

	_, err := cfg.resolve()
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "region")
}

func TestConfigRegionFromEnv(t *testing.T) {
	oldRegion := os.Getenv("AWS_REGION")
	os.Setenv("AWS_REGION", "ap-northeast-1")
	defer func() {
		if oldRegion != "" {
			os.Setenv("AWS_REGION", oldRegion)
		} else {
			os.Unsetenv("AWS_REGION")
		}
	}()

	cfg := Config{
		Host: "mycluster",
	}

	resolved, err := cfg.resolve()
	require.NoError(t, err)

	assert.Equal(t, "ap-northeast-1", resolved.Region)
}

func TestConfigMissingHost(t *testing.T) {
	cfg := Config{}

	_, err := cfg.resolve()
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "host")
}

func TestConfigAllFields(t *testing.T) {
	cfg := Config{
		Host:              "myhost.dsql.us-east-1.on.aws",
		Region:            "us-east-1",
		User:              "myuser",
		Database:          "mydb",
		Port:              5433,
		Profile:           "myprofile",
		TokenDurationSecs: 120,
	}

	resolved, err := cfg.resolve()
	require.NoError(t, err)

	assert.Equal(t, "myhost.dsql.us-east-1.on.aws", resolved.Host)
	assert.Equal(t, "us-east-1", resolved.Region)
	assert.Equal(t, "myuser", resolved.User)
	assert.Equal(t, "mydb", resolved.Database)
	assert.Equal(t, 5433, resolved.Port)
	assert.Equal(t, "myprofile", resolved.Profile)
	assert.Equal(t, 120*time.Second, resolved.TokenDuration)
}

func TestParseConnectionString(t *testing.T) {
	tests := []struct {
		name     string
		connStr  string
		expected Config
	}{
		{
			name:    "basic connection string",
			connStr: "postgres://admin@cluster.dsql.us-east-1.on.aws/postgres",
			expected: Config{
				Host:     "cluster.dsql.us-east-1.on.aws",
				User:     "admin",
				Database: "postgres",
			},
		},
		{
			name:    "with port",
			connStr: "postgres://admin@cluster.dsql.us-east-1.on.aws:5433/mydb",
			expected: Config{
				Host:     "cluster.dsql.us-east-1.on.aws",
				User:     "admin",
				Database: "mydb",
				Port:     5433,
			},
		},
		{
			name:    "with region parameter",
			connStr: "postgres://admin@cluster.dsql.us-east-1.on.aws/postgres?region=eu-west-1",
			expected: Config{
				Host:     "cluster.dsql.us-east-1.on.aws",
				User:     "admin",
				Database: "postgres",
				Region:   "eu-west-1",
			},
		},
		{
			name:    "with token duration",
			connStr: "postgres://admin@cluster.dsql.us-east-1.on.aws/postgres?tokenDurationSecs=300",
			expected: Config{
				Host:              "cluster.dsql.us-east-1.on.aws",
				User:              "admin",
				Database:          "postgres",
				TokenDurationSecs: 300,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg, err := ParseConnectionString(tt.connStr)
			require.NoError(t, err)

			assert.Equal(t, tt.expected.Host, cfg.Host)
			assert.Equal(t, tt.expected.User, cfg.User)
			assert.Equal(t, tt.expected.Database, cfg.Database)
			if tt.expected.Port != 0 {
				assert.Equal(t, tt.expected.Port, cfg.Port)
			}
			if tt.expected.Region != "" {
				assert.Equal(t, tt.expected.Region, cfg.Region)
			}
			if tt.expected.TokenDurationSecs != 0 {
				assert.Equal(t, tt.expected.TokenDurationSecs, cfg.TokenDurationSecs)
			}
		})
	}
}
