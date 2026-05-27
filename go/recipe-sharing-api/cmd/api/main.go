// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

// Command api runs the Recipe Sharing API as a local HTTP server backed
// by Amazon Aurora DSQL. This entrypoint is useful for local testing
// against a remote DSQL cluster. For production deployment on AWS Lambda,
// use cmd/lambda/main.go.
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/aws-samples/recipe-share-dsql-go/internal/router"
	"github.com/aws-samples/recipe-share-dsql-go/internal/store"
)

func main() {
	ctx := context.Background()

	// Read the Amazon Aurora DSQL endpoint from the environment.
	endpoint := os.Getenv("DSQL_ENDPOINT")
	if endpoint == "" {
		log.Fatal("DSQL_ENDPOINT environment variable is required")
	}

	// Create the Amazon Aurora DSQL store with IAM token-based authentication.
	dsqlStore, err := store.NewDSQLStore(ctx, endpoint)
	if err != nil {
		log.Fatalf("Failed to connect to Amazon Aurora DSQL: %v", err)
	}
	defer dsqlStore.Close()

	// Create the database schema if it does not already exist.
	if err := dsqlStore.InitSchema(ctx); err != nil {
		log.Fatalf("Failed to initialize database schema: %v", err)
	}

	// Determine the listen port from the environment, defaulting to 8080.
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Build the Gin router with the DSQL store.
	r := router.New(dsqlStore)

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: r,
	}

	// Start the server in a goroutine so we can handle graceful shutdown.
	go func() {
		log.Printf("Recipe Sharing API listening on http://localhost:%s (Aurora DSQL: %s)", port, endpoint)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Wait for an interrupt signal to gracefully shut down the server.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}
	log.Println("Server stopped")
}
