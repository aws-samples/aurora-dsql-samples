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
	// Setup before running tests
	setup()

	// Run all tests
	code := m.Run()

	// Cleanup after tests complete
	teardown()

	// Exit with the test status code
	os.Exit(code)
}

func setup() {
	// Initialize context with timeout for all tests
	testCtx, cancel = context.WithTimeout(context.Background(), 10*time.Minute)

	output, err := util.FindClusterByTag(testCtx, "us-east-1", "Name", "go multi-region cluster")

	if err != nil || output == nil {
		fmt.Errorf("Error finding cluster by tag")
		return
	}

	output1, err := util.FindClusterByTag(testCtx, "us-east-2", "Name", "go multi-region cluster")

	if err != nil || output1 == nil {
		fmt.Errorf("Error finding cluster by tag")
		return
	}

	// Set up any environment variables needed for tests
	os.Setenv("REGION", "us-east-1")
	os.Setenv("CLUSTER1_ID", *output.Identifier)
	os.Setenv("REGION2", "us-east-2")
	os.Setenv("CLUSTER2_ID", *output1.Identifier)

	// Add any other initialization code here
	// For example: database connections, mock services, etc.
}

func teardown() {
	// Cancel the context
	cancel()

	// Clean up any resources, close connections, etc.
}

// Test for DeleteMultiRegionClustersRegion function
func TestDeleteMultiRegionClustersRegion(t *testing.T) {
	// Test cases
	tests := []struct {
		name        string
		region1     string
		identifier1 string
		region2     string
		identifier2 string
		wantErr     bool
	}{
		{
			name:        "Delete multi-region cluster",
			region1:     "us-east-1",
			identifier1: os.Getenv("CLUSTER1_ID"),
			region2:     "us-east-2",
			identifier2: os.Getenv("CLUSTER2_ID"),
			wantErr:     false,
		},
		// Add more test cases as needed
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := util.UpdateCluster(testCtx, tt.region1, tt.identifier1, false)
			if (err != nil) != tt.wantErr {
				t.Errorf("UpdateCluster() us-east-1 error = %v, wantErr %v", err, tt.wantErr)
			}
			_, err = util.UpdateCluster(testCtx, tt.region2, tt.identifier2, false)
			if (err != nil) != tt.wantErr {
				t.Errorf("UpdateCluster() us-east-2 error = %v, wantErr %v", err, tt.wantErr)
			}

			err = DeleteMultiRegionClusters(testCtx, tt.region1, tt.identifier1, tt.region2, tt.identifier2)
			if (err != nil) != tt.wantErr {
				t.Errorf("DeleteMutiRegionClusters() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
