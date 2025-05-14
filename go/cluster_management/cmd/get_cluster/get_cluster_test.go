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

	output, err := util.FindClusterByTag(testCtx, "us-east-1", "Name", "go single region cluster")

	if err != nil {
		fmt.Errorf("Error finding cluster by tag")
	}

	// Set up any environment variables needed for tests
	os.Setenv("REGION", "us-east-1")
	os.Setenv("CLUSTER_ID", *output.Identifier)

	// Add any other initialization code here
	// For example: database connections, mock services, etc.
}

func teardown() {
	// Cancel the context
	cancel()

	// Clean up any resources, close connections, etc.
}

// Test for GetCluster function
func TestGetCluster(t *testing.T) {
	// Test cases
	tests := []struct {
		name       string
		region     string
		identifier string
		wantErr    bool
	}{
		{
			name:       "Valid cluster retrieval",
			region:     os.Getenv("REGION"),
			identifier: os.Getenv("CLUSTER_ID"),
			wantErr:    false,
		},
		// Add more test cases as needed
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := GetCluster(testCtx, tt.region, tt.identifier)
			if (err != nil) != tt.wantErr {
				t.Errorf("GetCluster() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

// Add more test functions for other commands in the cmd folder
