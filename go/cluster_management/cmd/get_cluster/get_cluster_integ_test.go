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

	output, err := util.FindClusterWithTagAndRepository(testCtx, "us-east-1", "Name", util.GetUniqueRunTagName("go single region cluster"))

	if err != nil || output == nil || output.Identifier == nil {
		fmt.Errorf("Error finding cluster by tag")
		return
	}

	// Set up any environment variables needed for tests
	os.Setenv("CLUSTER_REGION", "us-east-1")
	os.Setenv("CLUSTER_ID", *output.Identifier)
}

func teardown() {
	cancel()
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
			name:       "Get cluster retrieval",
			region:     os.Getenv("CLUSTER_REGION"),
			identifier: os.Getenv("CLUSTER_ID"),
			wantErr:    false,
		},
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
