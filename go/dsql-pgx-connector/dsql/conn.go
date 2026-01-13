/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package dsql

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// Conn wraps pgx.Conn with Aurora DSQL IAM authentication.
type Conn struct {
	*pgx.Conn
	config *resolvedConfig
}

// Connect creates a single connection to Aurora DSQL.
// The config parameter can be either a Config struct or a connection string.
func Connect(ctx context.Context, config any) (*Conn, error) {
	var cfg *Config

	switch c := config.(type) {
	case Config:
		cfg = &c
	case *Config:
		if c == nil {
			return nil, fmt.Errorf("config cannot be nil")
		}
		cfg = c
	case string:
		parsed, err := ParseConnectionString(c)
		if err != nil {
			return nil, err
		}
		cfg = parsed
	default:
		return nil, fmt.Errorf("config must be Config, *Config, or string, got %T", config)
	}

	resolved, err := cfg.resolve()
	if err != nil {
		return nil, err
	}

	return connectWithResolved(ctx, resolved)
}

func connectWithResolved(ctx context.Context, resolved *resolvedConfig) (*Conn, error) {
	credentialsProvider, err := resolveCredentialsProvider(ctx, resolved)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve credentials provider: %w", err)
	}

	token, err := GenerateToken(ctx, resolved.Host, resolved.Region, resolved.User, credentialsProvider, resolved.TokenDuration)
	if err != nil {
		return nil, err
	}

	connConfig, err := pgx.ParseConfig("")
	if err != nil {
		return nil, fmt.Errorf("unable to create connection config: %w", err)
	}

	resolved.configureConnConfig(connConfig)
	connConfig.Password = token

	conn, err := pgx.ConnectConfig(ctx, connConfig)
	if err != nil {
		return nil, fmt.Errorf("unable to connect: %w", err)
	}

	return &Conn{
		Conn:   conn,
		config: resolved,
	}, nil
}
