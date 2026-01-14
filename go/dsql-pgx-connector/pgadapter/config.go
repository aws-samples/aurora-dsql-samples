/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package pgadapter

import (
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
)

// Default configuration values
const (
	DefaultListenAddr = "127.0.0.1:5432"
	DefaultDSQLPort   = 5432
)

// Config holds the configuration for the pgadapter.
type Config struct {
	// DSQLEndpoint is the Aurora DSQL cluster endpoint. Required.
	// Example: "your-cluster.dsql.us-east-1.on.aws"
	DSQLEndpoint string

	// Region is the AWS region. Optional if parseable from DSQLEndpoint.
	Region string

	// ListenAddr is the address to listen on for client connections.
	// Default: "127.0.0.1:5432"
	ListenAddr string

	// DefaultUser is the default database user if not specified by client.
	// Default: "admin"
	DefaultUser string

	// DefaultDatabase is the default database if not specified by client.
	// Default: "postgres"
	DefaultDatabase string

	// DSQLPort is the port to connect to on the DSQL endpoint.
	// Default: 5432
	DSQLPort int

	// Profile is the AWS profile name for credentials. Optional.
	Profile string

	// TokenDuration is the validity duration for IAM authentication tokens.
	// Default: 15 minutes (the maximum allowed by Aurora DSQL).
	TokenDuration time.Duration

	// CustomCredentialsProvider is a custom AWS credentials provider. Optional.
	// If not set, credentials are resolved using the standard AWS SDK chain.
	CustomCredentialsProvider aws.CredentialsProvider

	// Logger is an optional logger for the adapter.
	// If not set, no logging is performed.
	Logger Logger
}

// Logger is the interface for logging within the adapter.
type Logger interface {
	// Info logs an informational message with optional key-value pairs.
	Info(msg string, keysAndValues ...any)

	// Error logs an error message with optional key-value pairs.
	Error(msg string, keysAndValues ...any)

	// Debug logs a debug message with optional key-value pairs.
	Debug(msg string, keysAndValues ...any)
}

// noopLogger is a logger that discards all messages.
type noopLogger struct{}

func (noopLogger) Info(msg string, keysAndValues ...any)  {}
func (noopLogger) Error(msg string, keysAndValues ...any) {}
func (noopLogger) Debug(msg string, keysAndValues ...any) {}
