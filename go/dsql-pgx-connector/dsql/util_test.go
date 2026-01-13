/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package dsql

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseRegion(t *testing.T) {
	tests := []struct {
		name        string
		host        string
		expected    string
		expectError bool
	}{
		{
			name:     "standard endpoint",
			host:     "mycluster.dsql.us-east-1.on.aws",
			expected: "us-east-1",
		},
		{
			name:     "eu-west-1 region",
			host:     "mycluster.dsql.eu-west-1.on.aws",
			expected: "eu-west-1",
		},
		{
			name:     "ap-southeast-2 region",
			host:     "mycluster.dsql.ap-southeast-2.on.aws",
			expected: "ap-southeast-2",
		},
		{
			name:     "non-prod endpoint (dsqlqa)",
			host:     "mycluster.dsqlqa.us-east-1.on.aws",
			expected: "us-east-1",
		},
		{
			name:     "beta endpoint (dsqlbeta)",
			host:     "mycluster.dsqlbeta.eu-west-1.on.aws",
			expected: "eu-west-1",
		},
		{
			name:        "invalid hostname - no dsql",
			host:        "mycluster.rds.us-east-1.amazonaws.com",
			expectError: true,
		},
		{
			name:        "invalid hostname - empty",
			host:        "",
			expectError: true,
		},
		{
			name:        "cluster ID only",
			host:        "mycluster",
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			region, err := ParseRegion(tt.host)
			if tt.expectError {
				assert.Error(t, err)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tt.expected, region)
			}
		})
	}
}

func TestBuildHostname(t *testing.T) {
	tests := []struct {
		name      string
		clusterID string
		region    string
		expected  string
	}{
		{
			name:      "us-east-1",
			clusterID: "mycluster",
			region:    "us-east-1",
			expected:  "mycluster.dsql.us-east-1.on.aws",
		},
		{
			name:      "eu-west-1",
			clusterID: "prod-cluster",
			region:    "eu-west-1",
			expected:  "prod-cluster.dsql.eu-west-1.on.aws",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := BuildHostname(tt.clusterID, tt.region)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestIsClusterID(t *testing.T) {
	tests := []struct {
		name     string
		host     string
		expected bool
	}{
		{
			name:     "valid cluster ID - example 1",
			host:     "ijsamhssbh36dopuigphknejb4",
			expected: true,
		},
		{
			name:     "valid cluster ID - example 2",
			host:     "jbtgm4i7xmqphuo2mgamk7oeza",
			expected: true,
		},
		{
			name:     "valid cluster ID - all letters",
			host:     "abcdefghijklmnopqrstuvwxyz",
			expected: true,
		},
		{
			name:     "valid cluster ID - all digits",
			host:     "01234567890123456789012345",
			expected: true,
		},
		{
			name:     "valid cluster ID - mixed",
			host:     "abc123def456ghi789jkl01234",
			expected: true,
		},
		{
			name:     "invalid - contains uppercase",
			host:     "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
			expected: false,
		},
		{
			name:     "invalid - too short",
			host:     "abcdefghijklmnopqrstuvwxy",
			expected: false,
		},
		{
			name:     "invalid - too long",
			host:     "abcdefghijklmnopqrstuvwxyz0",
			expected: false,
		},
		{
			name:     "invalid - arbitrary string",
			host:     "mycluster",
			expected: false,
		},
		{
			name:     "invalid - contains hyphens",
			host:     "my-cluster-1234567890abcde",
			expected: false,
		},
		{
			name:     "invalid - full hostname",
			host:     "mycluster.dsql.us-east-1.on.aws",
			expected: false,
		},
		{
			name:     "invalid - empty string",
			host:     "",
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsClusterID(tt.host)
			assert.Equal(t, tt.expected, result)
		})
	}
}
