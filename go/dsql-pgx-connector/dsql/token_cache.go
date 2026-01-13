/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package dsql

import (
	"context"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
)

// RefreshBufferPercentage is the percentage of token lifetime remaining
// when a refresh should be triggered. Default is 20% (refresh when 80% expired).
const RefreshBufferPercentage = 0.2

// tokenCacheKey uniquely identifies a token based on its configuration.
type tokenCacheKey struct {
	host          string
	region        string
	user          string
	tokenDuration time.Duration
}

// cachedToken holds a token with its expiration metadata.
type cachedToken struct {
	token       string
	generatedAt time.Time
	expiresAt   time.Time
}

// isExpiredOrExpiringSoon returns true if the token is expired or will expire
// within the refresh buffer period.
func (ct *cachedToken) isExpiredOrExpiringSoon(bufferPercentage float64) bool {
	now := time.Now()
	totalLifetime := ct.expiresAt.Sub(ct.generatedAt)
	bufferDuration := time.Duration(float64(totalLifetime) * bufferPercentage)
	refreshThreshold := ct.expiresAt.Add(-bufferDuration)
	return now.After(refreshThreshold)
}

// TokenCache provides thread-safe caching of authentication tokens.
// It caches tokens by (host, region, user, duration) and automatically
// refreshes them when they approach expiration.
type TokenCache struct {
	mu                  sync.RWMutex
	cache               map[tokenCacheKey]*cachedToken
	credentialsProvider aws.CredentialsProvider
}

// NewTokenCache creates a new token cache with a pre-resolved credentials provider.
// The credentialsProvider should be obtained from resolveCredentialsProvider to avoid
// repeated credential resolution.
func NewTokenCache(credentialsProvider aws.CredentialsProvider) *TokenCache {
	return &TokenCache{
		cache:               make(map[tokenCacheKey]*cachedToken),
		credentialsProvider: credentialsProvider,
	}
}

// GetToken returns a valid authentication token, using cache when possible.
// If the cached token is expired or expiring soon, a new token is generated.
func (tc *TokenCache) GetToken(ctx context.Context, host, region, user string, tokenDuration time.Duration) (string, error) {
	key := tokenCacheKey{
		host:          host,
		region:        region,
		user:          user,
		tokenDuration: tokenDuration,
	}

	// Check cache with read lock
	tc.mu.RLock()
	cached, exists := tc.cache[key]
	tc.mu.RUnlock()

	if exists && !cached.isExpiredOrExpiringSoon(RefreshBufferPercentage) {
		return cached.token, nil
	}

	// Need to refresh - acquire write lock
	tc.mu.Lock()
	defer tc.mu.Unlock()

	// Double-check after acquiring write lock (another goroutine may have refreshed)
	cached, exists = tc.cache[key]
	if exists && !cached.isExpiredOrExpiringSoon(RefreshBufferPercentage) {
		return cached.token, nil
	}

	// Generate new token using pre-resolved credentials
	token, err := GenerateToken(ctx, host, region, user, tc.credentialsProvider, tokenDuration)
	if err != nil {
		return "", err
	}

	// Cache the new token
	now := time.Now()
	// Use default duration for cache if not specified
	cacheDuration := tokenDuration
	if cacheDuration == 0 {
		cacheDuration = DefaultTokenDuration
	}

	tc.cache[key] = &cachedToken{
		token:       token,
		generatedAt: now,
		expiresAt:   now.Add(cacheDuration),
	}

	return token, nil
}

// Clear removes all cached tokens.
func (tc *TokenCache) Clear() {
	tc.mu.Lock()
	defer tc.mu.Unlock()
	tc.cache = make(map[tokenCacheKey]*cachedToken)
}

// Size returns the number of cached tokens.
func (tc *TokenCache) Size() int {
	tc.mu.RLock()
	defer tc.mu.RUnlock()
	return len(tc.cache)
}
