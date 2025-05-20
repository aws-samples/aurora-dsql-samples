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
	testCtx, cancel = context.WithTimeout(context.Background(), 10*time.Minute)

	output, err := util.FindClusterWithTagAndRepository(testCtx, "us-east-1", "Name", util.GetUniqueRunTagName("go multi-region cluster"))

	if err != nil || output == nil {
		fmt.Errorf("Error finding cluster by tag")
		return
	}

	output1, err := util.FindClusterWithTagAndRepository(testCtx, "us-east-2", "Name", util.GetUniqueRunTagName("go multi-region cluster"))

	if err != nil || output1 == nil {
		fmt.Errorf("Error finding cluster by tag")
		return
	}

	// Set up any environment variables needed for tests
	if output == nil || output1 == nil || output.Identifier == nil || output1.Identifier == nil {
		fmt.Errorf("Error finding cluster by tag")
		return
	}

	os.Setenv("CLUSTER_1_REGION", "us-east-1")
	os.Setenv("CLUSTER_1_ID", *output.Identifier)
	os.Setenv("CLUSTER_2_REGION", "us-east-2")
	os.Setenv("CLUSTER_2_ID", *output1.Identifier)
}

func teardown() {
	cancel()
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
			identifier1: os.Getenv("CLUSTER_1_ID"),
			region2:     "us-east-2",
			identifier2: os.Getenv("CLUSTER_2_ID"),
			wantErr:     false,
		},
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
