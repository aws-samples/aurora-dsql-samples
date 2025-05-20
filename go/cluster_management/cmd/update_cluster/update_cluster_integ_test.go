// example_test.go
package main

import (
	"context"
	"example/internal/util"
	"fmt"
	"os"
	"testing"
	"time"
)

// Global variables for shared resources
var (
	testCtx context.Context
	cancel  context.CancelFunc
)

func TestMain(m *testing.M) {
	setup()
	code := m.Run()
	teardown()
	os.Exit(code)
}

func setup() {
	// Initialize context with timeout for all tests
	testCtx, cancel = context.WithTimeout(context.Background(), 10*time.Minute)

	output, err := util.FindClusterWithTagAndRepository(testCtx, util.GetEnvWithDefault("CLUSTER_REGION", "us-east-1"),
		"Name", util.GetUniqueRunTagName("go single region cluster"))

	if err != nil || output == nil || output.Identifier == nil {
		fmt.Errorf("Error finding cluster by tag")
		return
	}
	// Set up any environment variables needed for test
	if err := os.Setenv("CLUSTER_REGION", util.GetEnvWithDefault("CLUSTER_REGION", "us-east-1")); err != nil {
		fmt.Errorf("Error setting REGION environment variable")
		return
	}
	if err := os.Setenv("CLUSTER_ID", *output.Identifier); err != nil {
		fmt.Errorf("Error setting CLUSTER_ID environment variable")
		return
	}
}

func teardown() {
	cancel()
}

// Test for UpdateCluster function
func TestUpdateCluster(t *testing.T) {
	// Test cases
	tests := []struct {
		name       string
		region     string
		identifier string
		wantErr    bool
	}{
		{
			name:       "Update cluster to disable delete protection",
			region:     os.Getenv("CLUSTER_REGION"),
			identifier: os.Getenv("CLUSTER_ID"),
			wantErr:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := UpdateCluster(testCtx, tt.identifier, tt.region, false)
			if (err != nil) != tt.wantErr {
				t.Errorf("UpdateCluster() error = %v, wantErr %v", err, tt.wantErr)
			}

		})
	}
}
