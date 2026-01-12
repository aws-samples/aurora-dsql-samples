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
