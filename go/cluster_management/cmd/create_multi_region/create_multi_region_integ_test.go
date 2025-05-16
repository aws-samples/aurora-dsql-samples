package main

import (
	"context"
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
}

func teardown() {
	cancel()
}

// Test for CreateMultiRegionCluster function
func TestCreateMultiRegionCluster(t *testing.T) {
	tests := []struct {
		name    string
		region1 string
		region2 string
		wantErr bool
	}{
		{
			name:    "Create multi-region clusters",
			region1: "us-east-1",
			region2: "us-east-2",
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := CreateMultiRegionClusters(testCtx, "us-west-2", tt.region1, tt.region2)
			if err != nil {
				fmt.Printf("failed to create multi-region clusters: %v", err)
				panic(err)
			}
		})
	}
}
