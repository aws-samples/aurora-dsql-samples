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
	config     *resolvedConfig
	tokenCache *TokenCache
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
	credentialsProvider, err := resolveCredentialsProvider(ctx, resolved)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve credentials provider: %w", err)
	}

	tokenCache := NewTokenCache(credentialsProvider)

	poolConfig, err := pgxpool.ParseConfig("")
	if err != nil {
		return nil, fmt.Errorf("unable to create pool config: %w", err)
	}

	resolved.configureConnConfig(poolConfig.ConnConfig)
	poolConfig.BeforeConnect = func(ctx context.Context, cfg *pgx.ConnConfig) error {
		token, err := tokenCache.GetToken(ctx, resolved.Host, resolved.Region, resolved.User, resolved.TokenDuration)
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
		Pool:       pool,
		config:     resolved,
		tokenCache: tokenCache,
	}, nil
}

// ClearTokenCache clears all cached authentication tokens.
// This can be useful when credentials have been rotated.
func (p *Pool) ClearTokenCache() {
	if p.tokenCache != nil {
		p.tokenCache.Clear()
	}
}
