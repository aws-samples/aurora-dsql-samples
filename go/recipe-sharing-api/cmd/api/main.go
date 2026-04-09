// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

// Command api runs the Recipe Sharing API locally using Gin and SQLite.
// This entrypoint is for local development only. For production deployment
// on AWS Lambda with Amazon Aurora DSQL, use cmd/lambda/main.go.
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
	// Determine the listen port from the environment, defaulting to 8080.
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Open the SQLite database for local development.
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "recipe_share.db"
	}

	sqliteStore, err := store.NewSQLiteStore(dbPath)
	if err != nil {
		log.Fatalf("Failed to open SQLite database: %v", err)
	}
	defer sqliteStore.Close()

	// Create the database tables if they do not already exist.
	if err := sqliteStore.InitSchema(context.Background()); err != nil {
		log.Fatalf("Failed to initialize database schema: %v", err)
	}

	// Build the Gin router with the SQLite store.
	r := router.New(sqliteStore)

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: r,
	}

	// Start the server in a goroutine so we can handle graceful shutdown.
	go func() {
		log.Printf("Recipe Sharing API listening on http://localhost:%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Wait for an interrupt signal to gracefully shut down the server.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}
	log.Println("Server stopped")
}
