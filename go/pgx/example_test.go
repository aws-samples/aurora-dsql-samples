package main

import (
	"os"
	"testing"
)

func TestExample(t *testing.T) {
	// Smoke test
	err := example(os.Getenv("CLUSTER_ENDPOINT"), os.Getenv("REGION"))
	if err != nil {
		t.Errorf("Error running example: %v\n", err)
	}
}
