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
	os.Setenv("CLUSTER_ID", *output.Identifier)
}

func teardown() {
	cancel()
}

// Test for DeleteSingleRegion function
func TestDeleteSingleRegion(t *testing.T) {
	// Test cases
	tests := []struct {
		name       string
		region     string
		identifier string
		wantErr    bool
	}{
		{
			name:       "Delete single-region cluster",
			region:     "us-east-1",
			identifier: os.Getenv("CLUSTER_ID"),
			wantErr:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := DeleteSingleRegion(testCtx, tt.identifier, tt.region)
			if (err != nil) != tt.wantErr {
				t.Errorf("DeleteSingleRegion() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
