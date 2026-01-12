/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package dsql

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool wraps pgxpool.Pool with Aurora DSQL IAM authentication.
type Pool struct {
	*pgxpool.Pool
	config *resolvedConfig
}

// NewPool creates a new connection pool to Aurora DSQL.
// The config parameter can be either a Config struct or a connection string.
func NewPool(ctx context.Context, config any) (*Pool, error) {
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

	return newPoolFromResolved(ctx, resolved)
}

func newPoolFromResolved(ctx context.Context, resolved *resolvedConfig) (*Pool, error) {
	connURL := resolved.connectionURL()

	poolConfig, err := pgxpool.ParseConfig(connURL)
	if err != nil {
		return nil, fmt.Errorf("unable to parse pool config: %w", err)
	}

	// Configure token generation on each connection
	poolConfig.BeforeConnect = func(ctx context.Context, cfg *pgx.ConnConfig) error {
		var token string
		var err error

		if resolved.Profile != "" {
			token, err = GenerateTokenWithProfile(ctx, resolved.Host, resolved.Region, resolved.User, resolved.Profile, resolved.TokenDuration)
		} else {
			token, err = GenerateToken(ctx, resolved.Host, resolved.Region, resolved.User, resolved.CustomCredentialsProvider, resolved.TokenDuration)
		}

		if err != nil {
			return err
		}

		cfg.Password = token
		return nil
	}

	// Apply pool configuration
	if resolved.MaxConns > 0 {
		poolConfig.MaxConns = resolved.MaxConns
	}
	if resolved.MinConns > 0 {
		poolConfig.MinConns = resolved.MinConns
	}
	if resolved.MaxConnLifetime > 0 {
		poolConfig.MaxConnLifetime = resolved.MaxConnLifetime
	}
	if resolved.MaxConnIdleTime > 0 {
		poolConfig.MaxConnIdleTime = resolved.MaxConnIdleTime
	}
	if resolved.HealthCheckPeriod > 0 {
		poolConfig.HealthCheckPeriod = resolved.HealthCheckPeriod
	}

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("unable to create connection pool: %w", err)
	}

	return &Pool{
		Pool:   pool,
		config: resolved,
	}, nil
}
