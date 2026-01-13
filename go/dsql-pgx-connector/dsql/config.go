/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package dsql

import (
	"crypto/tls"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/jackc/pgx/v5"
)

// Version is the connector version
const Version = "1.0.0"

// ApplicationName is set on connections for observability
const ApplicationName = "aurora-dsql-go-pgx/" + Version

// Default values for configuration
const (
	DefaultUser     = "admin"
	DefaultDatabase = "postgres"
	DefaultPort     = 5432
)

// Default pool timeouts (matching Node.js connector)
const (
	// DefaultMaxConnLifetime is the default maximum connection lifetime (55 minutes)
	// This aligns with DSQL's connection characteristics
	DefaultMaxConnLifetime = 55 * time.Minute
	// DefaultMaxConnIdleTime is the default maximum idle time (10 minutes)
	DefaultMaxConnIdleTime = 10 * time.Minute
	// DefaultTokenDuration is the default token validity duration (15 minutes)
	// This is the maximum allowed by Aurora DSQL
	DefaultTokenDuration = 15 * time.Minute
)

// Config holds the configuration for connecting to Aurora DSQL.
type Config struct {
	// Host is the cluster endpoint or cluster ID. Required.
	Host string

	// Region is the AWS region. Optional if parseable from Host.
	Region string

	// User is the database user. Default: "admin".
	User string

	// Database is the database name. Default: "postgres".
	Database string

	// Port is the database port. Default: 5432.
	Port int

	// Profile is the AWS profile name for credentials. Optional.
	Profile string

	// TokenDurationSecs is the token validity duration in seconds. Optional.
	TokenDurationSecs int

	// CustomCredentialsProvider is a custom AWS credentials provider. Optional.
	CustomCredentialsProvider aws.CredentialsProvider

	// Pool configuration options (passed through to pgxpool)
	MaxConns          int32
	MinConns          int32
	MaxConnLifetime   time.Duration
	MaxConnIdleTime   time.Duration
	HealthCheckPeriod time.Duration
}

// resolvedConfig holds the validated and resolved configuration.
type resolvedConfig struct {
	Host                      string
	Region                    string
	User                      string
	Database                  string
	Port                      int
	Profile                   string
	TokenDuration             time.Duration
	CustomCredentialsProvider aws.CredentialsProvider
	MaxConns                  int32
	MinConns                  int32
	MaxConnLifetime           time.Duration
	MaxConnIdleTime           time.Duration
	HealthCheckPeriod         time.Duration
}

// resolve validates the configuration and applies defaults.
func (c *Config) resolve() (*resolvedConfig, error) {
	if c.Host == "" {
		return nil, fmt.Errorf("host is required")
	}

	resolved := &resolvedConfig{
		Host:                      c.Host,
		Region:                    c.Region,
		User:                      c.User,
		Database:                  c.Database,
		Port:                      c.Port,
		Profile:                   c.Profile,
		CustomCredentialsProvider: c.CustomCredentialsProvider,
		MaxConns:                  c.MaxConns,
		MinConns:                  c.MinConns,
		MaxConnLifetime:           c.MaxConnLifetime,
		MaxConnIdleTime:           c.MaxConnIdleTime,
		HealthCheckPeriod:         c.HealthCheckPeriod,
	}

	// Apply defaults
	if resolved.User == "" {
		resolved.User = DefaultUser
	}
	if resolved.Database == "" {
		resolved.Database = DefaultDatabase
	}
	if resolved.Port == 0 {
		resolved.Port = DefaultPort
	}
	if resolved.Port < 1 || resolved.Port > 65535 {
		return nil, fmt.Errorf("port must be between 1 and 65535, got %d", resolved.Port)
	}
	if resolved.MaxConnLifetime == 0 {
		resolved.MaxConnLifetime = DefaultMaxConnLifetime
	}
	if resolved.MaxConnIdleTime == 0 {
		resolved.MaxConnIdleTime = DefaultMaxConnIdleTime
	}

	// Convert token duration with default
	if c.TokenDurationSecs > 0 {
		resolved.TokenDuration = time.Duration(c.TokenDurationSecs) * time.Second
	} else {
		resolved.TokenDuration = DefaultTokenDuration
	}

	// Handle cluster ID vs full hostname
	if IsClusterID(resolved.Host) {
		// Need region to build hostname
		if resolved.Region == "" {
			resolved.Region = getRegionFromEnv()
		}
		if resolved.Region == "" {
			return nil, fmt.Errorf("region is required when host is a cluster ID")
		}
		resolved.Host = BuildHostname(c.Host, resolved.Region)
	} else {
		// Try to parse region from hostname if not provided
		if resolved.Region == "" {
			parsedRegion, err := ParseRegion(resolved.Host)
			if err != nil {
				// Try environment
				resolved.Region = getRegionFromEnv()
				if resolved.Region == "" {
					return nil, fmt.Errorf("region is required: could not parse from hostname and not set in environment")
				}
			} else {
				resolved.Region = parsedRegion
			}
		}
	}

	return resolved, nil
}

// getRegionFromEnv returns the AWS region from environment variables.
func getRegionFromEnv() string {
	if region := os.Getenv("AWS_REGION"); region != "" {
		return region
	}
	return os.Getenv("AWS_DEFAULT_REGION")
}

// ParseConnectionString parses a PostgreSQL connection string into a Config.
func ParseConnectionString(connStr string) (*Config, error) {
	u, err := url.Parse(connStr)
	if err != nil {
		return nil, fmt.Errorf("invalid connection string: %w", err)
	}

	cfg := &Config{
		Host: u.Hostname(),
	}

	if u.User != nil {
		cfg.User = u.User.Username()
	}

	if u.Path != "" && u.Path != "/" {
		cfg.Database = u.Path[1:] // Remove leading slash
	}

	if portStr := u.Port(); portStr != "" {
		port, err := strconv.Atoi(portStr)
		if err != nil {
			return nil, fmt.Errorf("invalid port: %w", err)
		}
		cfg.Port = port
	}

	// Parse query parameters
	query := u.Query()

	if region := query.Get("region"); region != "" {
		cfg.Region = region
	}

	if profile := query.Get("profile"); profile != "" {
		cfg.Profile = profile
	}

	if tokenDuration := query.Get("tokenDurationSecs"); tokenDuration != "" {
		duration, err := strconv.Atoi(tokenDuration)
		if err != nil {
			return nil, fmt.Errorf("invalid tokenDurationSecs: %w", err)
		}
		cfg.TokenDurationSecs = duration
	}

	return cfg, nil
}

// configureConnConfig sets connection parameters on a pgx.ConnConfig.
// This centralizes the common configuration used by both Pool and Conn.
func (r *resolvedConfig) configureConnConfig(cfg *pgx.ConnConfig) {
	cfg.Host = r.Host
	cfg.Port = uint16(r.Port)
	cfg.Database = r.Database
	cfg.User = r.User
	cfg.TLSConfig = &tls.Config{
		ServerName: r.Host,
		MinVersion: tls.VersionTLS12,
	}
	cfg.RuntimeParams = map[string]string{
		"application_name": ApplicationName,
	}
}
