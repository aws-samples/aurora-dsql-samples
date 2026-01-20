/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package dsql

import (
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials/stscreds"
	"github.com/aws/aws-sdk-go-v2/feature/dsql/auth"
	"github.com/aws/aws-sdk-go-v2/service/sts"
)

const adminUser = "admin"

// resolveCredentialsProvider resolves the AWS credentials provider once based on the configuration.
// This avoids repeated credential resolution on each token generation.
func resolveCredentialsProvider(ctx context.Context, resolved *resolvedConfig) (aws.CredentialsProvider, error) {
	// If custom provider is specified, use it directly
	if resolved.CustomCredentialsProvider != nil {
		return resolved.CustomCredentialsProvider, nil
	}

	// If profile is specified, load config with that profile
	if resolved.Profile != "" {
		cfg, err := config.LoadDefaultConfig(ctx,
			config.WithRegion(resolved.Region),
			config.WithSharedConfigProfile(resolved.Profile),
		)
		if err != nil {
			return nil, fmt.Errorf("failed to load AWS config with profile %s: %w", resolved.Profile, err)
		}
		return cfg.Credentials, nil
	}

	// Use default credential chain
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(resolved.Region))
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}
	return cfg.Credentials, nil
}

// GenerateToken generates an IAM authentication token for Aurora DSQL.
// If user is "admin", generates an admin token; otherwise generates a standard token.
// If credentialsProvider is nil, uses the default AWS credential chain.
// If expiry is 0, uses the AWS SDK default.
func GenerateToken(
	ctx context.Context,
	host string,
	region string,
	user string,
	credentialsProvider aws.CredentialsProvider,
	expiry time.Duration,
) (string, error) {
	var creds aws.CredentialsProvider

	if credentialsProvider != nil {
		creds = credentialsProvider
	} else {
		cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
		if err != nil {
			return "", fmt.Errorf("failed to load AWS config: %w", err)
		}
		creds = cfg.Credentials
	}

	var tokenOpts []func(*auth.TokenOptions)
	if expiry > 0 {
		tokenOpts = append(tokenOpts, func(opts *auth.TokenOptions) {
			opts.ExpiresIn = expiry
		})
	}

	var token string
	var err error

	if user == adminUser {
		token, err = auth.GenerateDBConnectAdminAuthToken(ctx, host, region, creds, tokenOpts...)
	} else {
		token, err = auth.GenerateDbConnectAuthToken(ctx, host, region, creds, tokenOpts...)
	}

	if err != nil {
		return "", fmt.Errorf("failed to generate auth token: %w", err)
	}

	if token == "" {
		return "", fmt.Errorf("generated auth token is empty")
	}

	return token, nil
}

// GenerateTokenWithProfile generates an IAM authentication token using a specific AWS profile.
func GenerateTokenWithProfile(
	ctx context.Context,
	host string,
	region string,
	user string,
	profile string,
	expiry time.Duration,
) (string, error) {
	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(region),
		config.WithSharedConfigProfile(profile),
	)
	if err != nil {
		return "", fmt.Errorf("failed to load AWS config with profile %s: %w", profile, err)
	}

	return GenerateToken(ctx, host, region, user, cfg.Credentials, expiry)
}

// NewAssumeRoleCredentialsProvider creates a credentials provider that assumes an IAM role.
func NewAssumeRoleCredentialsProvider(ctx context.Context, roleARN, region string) (aws.CredentialsProvider, error) {
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	stsClient := sts.NewFromConfig(cfg)
	return stscreds.NewAssumeRoleProvider(stsClient, roleARN), nil
}

// GenerateDBToken generates an IAM authentication token from a DSQL connection string.
// This is useful for use with database/sql drivers that don't support the Pool/Conn wrappers.
// The connection string should be in the format: dsql://user@host/database or postgres://user@host/database
//
// Example usage:
//
//	token, err := dsql.GenerateDBToken(ctx, "dsql://admin@cluster.dsql.us-east-1.on.aws/postgres")
//	if err != nil {
//	    log.Fatal(err)
//	}
//	// Use token as password in database/sql connection string
func GenerateDBToken(ctx context.Context, connStr string) (string, error) {
	// Parse the connection string
	cfg, err := ParseConnectionString(connStr)
	if err != nil {
		return "", fmt.Errorf("failed to parse connection string: %w", err)
	}

	// Resolve the configuration
	resolved, err := cfg.resolve()
	if err != nil {
		return "", fmt.Errorf("failed to resolve configuration: %w", err)
	}

	// Resolve credentials provider
	credentialsProvider, err := resolveCredentialsProvider(ctx, resolved)
	if err != nil {
		return "", fmt.Errorf("failed to resolve credentials provider: %w", err)
	}

	// Generate token
	return GenerateToken(ctx, resolved.Host, resolved.Region, resolved.User, credentialsProvider, resolved.TokenDuration)
}
