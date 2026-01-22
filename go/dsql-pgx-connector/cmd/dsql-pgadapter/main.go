/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// dsql-pgadapter is a PostgreSQL wire protocol proxy for Aurora DSQL.
// It allows standard PostgreSQL clients to connect to Aurora DSQL clusters
// using IAM authentication tokens.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/aws-samples/aurora-dsql-samples/go/dsql-pgx-connector/pgadapter"
)

const version = "1.0.0"

// stdLogger implements pgadapter.Logger using the standard library log package.
type stdLogger struct {
	verbose bool
}

func (l *stdLogger) Info(msg string, keysAndValues ...any) {
	if kv := formatKV(keysAndValues); kv != "" {
		log.Printf("[INFO] %s %s", msg, kv)
	} else {
		log.Printf("[INFO] %s", msg)
	}
}

func (l *stdLogger) Error(msg string, keysAndValues ...any) {
	if kv := formatKV(keysAndValues); kv != "" {
		log.Printf("[ERROR] %s %s", msg, kv)
	} else {
		log.Printf("[ERROR] %s", msg)
	}
}

func (l *stdLogger) Debug(msg string, keysAndValues ...any) {
	if l.verbose {
		if kv := formatKV(keysAndValues); kv != "" {
			log.Printf("[DEBUG] %s %s", msg, kv)
		} else {
			log.Printf("[DEBUG] %s", msg)
		}
	}
}

// formatKV formats key-value pairs for logging using strings.Builder for efficiency.
func formatKV(keysAndValues []any) string {
	if len(keysAndValues) == 0 {
		return ""
	}
	var sb strings.Builder
	for i := 0; i < len(keysAndValues); i += 2 {
		if i > 0 {
			sb.WriteByte(' ')
		}
		if i+1 < len(keysAndValues) {
			fmt.Fprintf(&sb, "%v=%v", keysAndValues[i], keysAndValues[i+1])
		} else {
			fmt.Fprintf(&sb, "%v=?", keysAndValues[i])
		}
	}
	return sb.String()
}

func main() {
	// Define flags
	endpoint := flag.String("endpoint", "", "Aurora DSQL cluster endpoint (required)")
	region := flag.String("region", "", "AWS region (optional, parsed from endpoint if not provided)")
	listen := flag.String("listen", "127.0.0.1:5432", "Address to listen on for client connections")
	user := flag.String("user", "admin", "Default database user")
	database := flag.String("database", "postgres", "Default database name")
	profile := flag.String("profile", "", "AWS profile name for credentials")
	verbose := flag.Bool("verbose", false, "Enable verbose (debug) logging")
	showVersion := flag.Bool("version", false, "Print version and exit")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "dsql-pgadapter - PostgreSQL wire protocol proxy for Aurora DSQL\n\n")
		fmt.Fprintf(os.Stderr, "Usage:\n")
		fmt.Fprintf(os.Stderr, "  dsql-pgadapter --endpoint <dsql-endpoint> [options]\n\n")
		fmt.Fprintf(os.Stderr, "Options:\n")
		flag.PrintDefaults()
		fmt.Fprintf(os.Stderr, "\nExample:\n")
		fmt.Fprintf(os.Stderr, "  dsql-pgadapter --endpoint your-cluster.dsql.us-east-1.on.aws\n")
	}

	flag.Parse()

	// Handle --version
	if *showVersion {
		fmt.Printf("dsql-pgadapter version %s\n", version)
		os.Exit(0)
	}

	// Validate required flags
	if *endpoint == "" {
		fmt.Fprintln(os.Stderr, "Error: --endpoint is required")
		flag.Usage()
		os.Exit(1)
	}

	// Create logger
	logger := &stdLogger{verbose: *verbose}

	// Create adapter configuration
	cfg := pgadapter.Config{
		DSQLEndpoint:    *endpoint,
		Region:          *region,
		ListenAddr:      *listen,
		DefaultUser:     *user,
		DefaultDatabase: *database,
		Profile:         *profile,
		Logger:          logger,
	}

	// Create adapter
	adapter, err := pgadapter.New(cfg)
	if err != nil {
		log.Fatalf("Failed to create adapter: %v", err)
	}

	// Setup signal handling
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-sigCh
		log.Printf("Received signal %v, shutting down...", sig)
		cancel()
	}()

	// Print startup message
	log.Printf("Starting dsql-pgadapter version %s", version)
	log.Printf("Listening on %s, proxying to %s", *listen, *endpoint)

	// Start serving
	if err := adapter.ListenAndServe(ctx); err != nil {
		log.Fatalf("Adapter error: %v", err)
	}

	log.Println("Shutdown complete")
}
