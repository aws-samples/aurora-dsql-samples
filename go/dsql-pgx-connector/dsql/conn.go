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
	connURL := resolved.connectionURL()

	connConfig, err := pgx.ParseConfig(connURL)
	if err != nil {
		return nil, fmt.Errorf("unable to parse connection config: %w", err)
	}

	// Generate token
	var token string
	if resolved.Profile != "" {
		token, err = GenerateTokenWithProfile(ctx, resolved.Host, resolved.Region, resolved.User, resolved.Profile, resolved.TokenDuration)
	} else {
		token, err = GenerateToken(ctx, resolved.Host, resolved.Region, resolved.User, resolved.CustomCredentialsProvider, resolved.TokenDuration)
	}
	if err != nil {
		return nil, err
	}

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
