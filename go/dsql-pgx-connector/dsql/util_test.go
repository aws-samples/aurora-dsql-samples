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
			host:     "cluster123.dsql.us-east-1.on.aws",
			expected: "us-east-1",
		},
		{
			name:     "eu-west-1 region",
			host:     "mycluster.dsql.eu-west-1.on.aws",
			expected: "eu-west-1",
		},
		{
			name:     "ap-southeast-2 region",
			host:     "test.dsql.ap-southeast-2.on.aws",
			expected: "ap-southeast-2",
		},
		{
			name:        "invalid hostname - no dsql",
			host:        "cluster123.rds.us-east-1.amazonaws.com",
			expectError: true,
		},
		{
			name:        "invalid hostname - empty",
			host:        "",
			expectError: true,
		},
		{
			name:        "cluster ID only",
			host:        "cluster123",
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
			name:     "cluster ID only",
			host:     "mycluster123",
			expected: true,
		},
		{
			name:     "full hostname",
			host:     "mycluster.dsql.us-east-1.on.aws",
			expected: false,
		},
		{
			name:     "empty string",
			host:     "",
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsClusterID(tt.host)
			assert.Equal(t, tt.expected, result)
		})
	}
}
