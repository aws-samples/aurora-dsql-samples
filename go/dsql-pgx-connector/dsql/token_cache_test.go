/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package dsql

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestCachedTokenExpiration(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name             string
		generatedAt      time.Time
		duration         time.Duration
		bufferPercentage float64
		expected         bool
	}{
		{
			name:             "fresh token - not expired",
			generatedAt:      now,
			duration:         15 * time.Minute,
			bufferPercentage: 0.2,
			expected:         false,
		},
		{
			name:             "token at 50% lifetime - not expired",
			generatedAt:      now.Add(-7*time.Minute - 30*time.Second),
			duration:         15 * time.Minute,
			bufferPercentage: 0.2,
			expected:         false,
		},
		{
			name:             "token at 80% lifetime - should refresh (within 20% buffer)",
			generatedAt:      now.Add(-12 * time.Minute),
			duration:         15 * time.Minute,
			bufferPercentage: 0.2,
			expected:         true,
		},
		{
			name:             "token fully expired",
			generatedAt:      now.Add(-16 * time.Minute),
			duration:         15 * time.Minute,
			bufferPercentage: 0.2,
			expected:         true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cached := &cachedToken{
				token:       "test-token",
				generatedAt: tt.generatedAt,
				expiresAt:   tt.generatedAt.Add(tt.duration),
			}

			result := cached.isExpiredOrExpiringSoon(tt.bufferPercentage)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestTokenCacheKeyEquality(t *testing.T) {
	key1 := tokenCacheKey{
		host:          "host1.dsql.us-east-1.on.aws",
		region:        "us-east-1",
		user:          "admin",
		tokenDuration: 15 * time.Minute,
	}

	key2 := tokenCacheKey{
		host:          "host1.dsql.us-east-1.on.aws",
		region:        "us-east-1",
		user:          "admin",
		tokenDuration: 15 * time.Minute,
	}

	key3 := tokenCacheKey{
		host:          "host2.dsql.us-east-1.on.aws",
		region:        "us-east-1",
		user:          "admin",
		tokenDuration: 15 * time.Minute,
	}

	// Same keys should be equal
	assert.Equal(t, key1, key2)

	// Different host should produce different key
	assert.NotEqual(t, key1, key3)
}

func TestTokenCacheClear(t *testing.T) {
	cache := NewTokenCache(nil)

	// Manually populate cache for testing
	cache.mu.Lock()
	cache.cache[tokenCacheKey{
		host:   "test.dsql.us-east-1.on.aws",
		region: "us-east-1",
		user:   "admin",
	}] = &cachedToken{
		token:       "test-token",
		generatedAt: time.Now(),
		expiresAt:   time.Now().Add(15 * time.Minute),
	}
	cache.mu.Unlock()

	assert.Equal(t, 1, cache.Size())

	cache.Clear()

	assert.Equal(t, 0, cache.Size())
}

func TestNewTokenCache(t *testing.T) {
	cache := NewTokenCache(nil)

	assert.NotNil(t, cache)
	assert.NotNil(t, cache.cache)
	assert.Equal(t, 0, cache.Size())
}

func TestRefreshBufferPercentage(t *testing.T) {
	// Verify the constant is set to 20%
	assert.Equal(t, 0.2, RefreshBufferPercentage)
}

func TestTokenCacheConcurrentAccess(t *testing.T) {
	// This test verifies thread safety of the token cache.
	// Run with -race flag to detect race conditions: go test -race ./dsql/...
	cache := NewTokenCache(nil)

	const numGoroutines = 50
	const numOperations = 100

	done := make(chan bool, numGoroutines)

	// Spawn multiple goroutines that concurrently read/write to the cache
	for i := 0; i < numGoroutines; i++ {
		go func(id int) {
			for j := 0; j < numOperations; j++ {
				// Manually populate and read from cache to test concurrency
				// We can't use GetToken directly as it requires a real credentials provider
				key := tokenCacheKey{
					host:          "test.dsql.us-east-1.on.aws",
					region:        "us-east-1",
					user:          "admin",
					tokenDuration: 15 * time.Minute,
				}

				// Write operation
				cache.mu.Lock()
				cache.cache[key] = &cachedToken{
					token:       "test-token",
					generatedAt: time.Now(),
					expiresAt:   time.Now().Add(15 * time.Minute),
				}
				cache.mu.Unlock()

				// Read operation
				cache.mu.RLock()
				_ = cache.cache[key]
				cache.mu.RUnlock()

				// Size operation (uses RLock)
				_ = cache.Size()

				// Clear operation (uses Lock)
				if j%50 == 0 {
					cache.Clear()
				}
			}
			done <- true
		}(i)
	}

	// Wait for all goroutines to complete
	for i := 0; i < numGoroutines; i++ {
		<-done
	}

	// If we get here without deadlock or race detector errors, the test passes
}
