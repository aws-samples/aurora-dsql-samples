/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package pgadapter

import (
	"context"
	"errors"
	"fmt"
	"net"
	"sync"
	"sync/atomic"

	"github.com/aws-samples/aurora-dsql-samples/go/dsql-pgx-connector/dsql"
)

// Adapter is a PostgreSQL wire protocol proxy for Aurora DSQL.
type Adapter struct {
	config     *resolvedConfig
	tokenCache *dsql.TokenCache
	listener   net.Listener
	logger     Logger

	// shutdown state
	closed   atomic.Bool
	wg       sync.WaitGroup
	closeMu  sync.Mutex
	closeErr error
}

// resolvedConfig holds the validated configuration with defaults applied.
type resolvedConfig struct {
	dsqlEndpoint    string
	region          string
	listenAddr      string
	defaultUser     string
	defaultDatabase string
	dsqlPort        int
	tokenDuration   int64 // nanoseconds
}

// New creates a new Adapter with the given configuration.
// It validates the configuration and resolves the AWS region from the endpoint
// if not explicitly provided.
func New(cfg Config) (*Adapter, error) {
	if cfg.DSQLEndpoint == "" {
		return nil, errors.New("DSQLEndpoint is required")
	}

	// Resolve region from endpoint if not provided
	region := cfg.Region
	if region == "" {
		var err error
		region, err = dsql.ParseRegion(cfg.DSQLEndpoint)
		if err != nil {
			return nil, fmt.Errorf("could not parse region from endpoint and Region not provided: %w", err)
		}
	}

	// Apply defaults
	listenAddr := cfg.ListenAddr
	if listenAddr == "" {
		listenAddr = DefaultListenAddr
	}

	defaultUser := cfg.DefaultUser
	if defaultUser == "" {
		defaultUser = dsql.DefaultUser
	}

	defaultDatabase := cfg.DefaultDatabase
	if defaultDatabase == "" {
		defaultDatabase = dsql.DefaultDatabase
	}

	dsqlPort := cfg.DSQLPort
	if dsqlPort == 0 {
		dsqlPort = DefaultDSQLPort
	}

	tokenDuration := cfg.TokenDuration
	if tokenDuration == 0 {
		tokenDuration = dsql.DefaultTokenDuration
	}

	logger := cfg.Logger
	if logger == nil {
		logger = noopLogger{}
	}

	// Resolve credentials provider
	ctx := context.Background()
	credentialsProvider, err := dsql.ResolveCredentialsProvider(
		ctx,
		region,
		cfg.Profile,
		cfg.CustomCredentialsProvider,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve credentials provider: %w", err)
	}

	// Create token cache
	tokenCache := dsql.NewTokenCache(credentialsProvider)

	return &Adapter{
		config: &resolvedConfig{
			dsqlEndpoint:    cfg.DSQLEndpoint,
			region:          region,
			listenAddr:      listenAddr,
			defaultUser:     defaultUser,
			defaultDatabase: defaultDatabase,
			dsqlPort:        dsqlPort,
			tokenDuration:   int64(tokenDuration),
		},
		tokenCache: tokenCache,
		logger:     logger,
	}, nil
}

// ListenAndServe starts listening for client connections and serves them.
// It blocks until the context is canceled or Close is called.
// When the context is canceled, it stops accepting new connections but allows
// existing connections to complete.
func (a *Adapter) ListenAndServe(ctx context.Context) error {
	if a.closed.Load() {
		return errors.New("adapter is closed")
	}

	listener, err := net.Listen("tcp", a.config.listenAddr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", a.config.listenAddr, err)
	}

	a.closeMu.Lock()
	a.listener = listener
	a.closeMu.Unlock()

	a.logger.Info("adapter started",
		"listen_addr", listener.Addr().String(),
		"dsql_endpoint", a.config.dsqlEndpoint,
		"region", a.config.region,
	)

	// Handle context cancellation
	go func() {
		<-ctx.Done()
		a.Close()
	}()

	for {
		conn, err := listener.Accept()
		if err != nil {
			if a.closed.Load() {
				// Expected error after Close()
				return nil
			}
			// Log and continue on transient errors, fail on permanent errors
			a.logger.Error("accept error", "error", err)
			return fmt.Errorf("accept error: %w", err)
		}

		a.wg.Add(1)
		go func() {
			defer a.wg.Done()
			a.handleConnection(ctx, conn)
		}()
	}
}

// Close stops the adapter from accepting new connections and waits for
// existing connections to complete.
func (a *Adapter) Close() error {
	if !a.closed.CompareAndSwap(false, true) {
		// Already closed
		return a.closeErr
	}

	a.closeMu.Lock()
	if a.listener != nil {
		a.closeErr = a.listener.Close()
	}
	a.closeMu.Unlock()

	// Wait for all connections to complete
	a.wg.Wait()

	a.logger.Info("adapter stopped")
	return a.closeErr
}

// Addr returns the address the adapter is listening on.
// Returns an empty string if the adapter is not listening.
func (a *Adapter) Addr() string {
	a.closeMu.Lock()
	defer a.closeMu.Unlock()

	if a.listener == nil {
		return ""
	}
	return a.listener.Addr().String()
}
