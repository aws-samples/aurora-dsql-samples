package main

import (
	"testing"
)

func TestExample(t *testing.T) {
	// Smoke test
	err := example()
	if err != nil {
        t.Errorf("Error running example: %v\n", err)
    }
}