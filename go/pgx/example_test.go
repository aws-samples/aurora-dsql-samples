package main

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"os"
	"strconv"
	"sync"
	"testing"
	"time"
)

func init() {
	if os.Getenv("CLUSTER_ENDPOINT") == "" {
		panic("environment variable CLUSTER_ENDPOINT not set")
	}

	if os.Getenv("REGION") == "" {
		panic("environment variable REGION not set")
	}
}

// cacheEnvVar returns a function that can be used to restore the original environment variable value
func cacheEnvVar(t *testing.T, key string) func() {
	original, exists := os.LookupEnv(key)

	return func() {
		if exists {
			err := os.Setenv(key, original)
			assert.NoError(t, err)
		} else {
			err := os.Unsetenv(key)
			assert.NoError(t, err)
		}
	}
}

// setAndCacheEnvVar sets an environment variable and returns a function that can be used to restore the original value
func setAndCacheEnvVar(t *testing.T, key string, value string) func() {
	callback := cacheEnvVar(t, key)

	err := os.Setenv(key, value)
	assert.NoError(t, err)

	return callback
}

// getConnectionID gets a unique identifier for a connection without using pg_backend_pid
func getConnectionID(t *testing.T, ctx context.Context, pool *pgxpool.Pool) string {
	var connID string
	err := pool.QueryRow(ctx, "select sys.current_session_id();").Scan(&connID)
	assert.NoError(t, err)

	return connID
}

func assertPoolWorks(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	err := pool.Ping(ctx)
	assert.NoError(t, err)
}

func assertPoolPanics(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	assert.Panics(t, func() {
		err := pool.Ping(ctx)
		if err != nil {
			panic(err)
		}
	}, "Expected pool ping to panic")
}

func TestGenerateDbConnectAuthToken(t *testing.T) {
	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	assert.NotEmpty(t, clusterEndpoint, "cluster endpoint must not be empty")

	region := os.Getenv("REGION")
	assert.NotEmpty(t, region, "region must not be empty")

	// Expiry doesn't matter since we don't intend to connect with it.
	tokenExpiry := 1 * time.Second

	// Test token generation
	ctx := context.Background()
	token, err := GenerateDbConnectAuthToken(ctx, clusterEndpoint, region, "admin", tokenExpiry)
	assert.NoError(t, err)

	assert.NotEmpty(t, token, "auth token must not be empty")
}

func TestNewPool(t *testing.T) {
	ctx := context.Background()
	pool, cancel, err := NewPool(ctx)
	assert.NoError(t, err)
	defer func() {
		pool.Close()
		cancel()
	}()

	assertPoolWorks(t, ctx, pool)
}

func TestTokenExpiryConfigurable(t *testing.T) {
	resetVar := setAndCacheEnvVar(t, "TOKEN_EXPIRY_SECS", "-1")
	defer resetVar()

	ctx := context.Background()
	pool, cancel, err := NewPool(ctx)
	assert.NoError(t, err)
	defer func() {
		pool.Close()
		cancel()
	}()

	assertPoolPanics(t, ctx, pool)
}

func TestGetEnv(t *testing.T) {
	varName := "TEST_ENV_VAR"

	resetVar := cacheEnvVar(t, varName)
	defer resetVar()

	// Test with environment variable set
	err := os.Setenv(varName, "test_value")
	assert.NoError(t, err)
	result := getEnv(varName, "default_value")
	assert.Equal(t, "test_value", result, "Should return the environment variable value when set")

	// Test with environment variable not set
	err = os.Unsetenv(varName)
	assert.NoError(t, err)
	result = getEnv(varName, "default_value")
	assert.Equal(t, "default_value", result, "Should return the default value when environment variable is not set")
}

func TestGetEnvOrThrow(t *testing.T) {
	varName := "TEST_ENV_VAR"

	resetVar := cacheEnvVar(t, varName)
	defer resetVar()

	// Test with environment variable set
	err := os.Setenv(varName, "test_value")
	assert.NoError(t, err)

	// Should not panic when environment variable is set
	assert.NotPanics(t, func() {
		result := getEnvOrThrow(varName)
		assert.Equal(t, "test_value", result, "Should return the environment variable value when set")
	})

	// Test with environment variable not set
	err = os.Unsetenv(varName)
	assert.NoError(t, err)

	// Should panic when environment variable is not set
	assert.Panics(t, func() {
		getEnvOrThrow(varName)
	}, "Should panic when environment variable is not set")
}

func TestGetEnvInt(t *testing.T) {
	varName := "TEST_ENV_INT"

	resetVar := cacheEnvVar(t, varName)
	defer resetVar()

	// Test with valid integer environment variable
	err := os.Setenv(varName, "123")
	assert.NoError(t, err)
	result := getEnvInt(varName, 456)
	assert.Equal(t, 123, result, "Should return the integer value from environment variable")

	// Test with invalid integer environment variable
	err = os.Setenv(varName, "not_an_int")
	assert.NoError(t, err)
	result = getEnvInt(varName, 456)
	assert.Equal(t, 456, result, "Should return the default value when environment variable is not a valid integer")

	// Test with environment variable not set
	err = os.Unsetenv(varName)
	assert.NoError(t, err)
	result = getEnvInt(varName, 456)
	assert.Equal(t, 456, result, "Should return the default value when environment variable is not set")
}

func TestExample(t *testing.T) {
	// Run the example
	err := example()
	if err != nil {
		t.Errorf("Error running example: %v\n", err)
	}
}

func configureTokenExpiry(t *testing.T) (time.Duration, func()) {
	tokenExpiry := 2 * time.Second

	expirySeconds := int(tokenExpiry.Seconds())
	expiryString := strconv.Itoa(expirySeconds)

	resetVar := setAndCacheEnvVar(t, "TOKEN_EXPIRY_SECS", expiryString)

	return tokenExpiry, resetVar
}

// waitForExpiry waits long enough for a time duration to expire
func waitForExpiry(t *testing.T, expiry time.Duration) {
	waitTime := 2 * expiry
	t.Logf("Waiting for %v to exceed expiry time...", waitTime)
	time.Sleep(waitTime)
}

func TestEstablishedConnectionUsableAfterTokenExpiry(t *testing.T) {
	poolConfig := func(config *pgxpool.Config) {
		config.MaxConns = 1
		config.MinConns = 1
	}

	tokenExpiry, resetVar := configureTokenExpiry(t)
	defer resetVar()

	ctx := context.Background()
	pool, cancel, err := NewPool(ctx, poolConfig)
	assert.NoError(t, err)
	defer func() {
		pool.Close()
		cancel()
	}()

	// Initial test to verify connection works
	assertPoolWorks(t, ctx, pool)
	connIdBefore := getConnectionID(t, ctx, pool)

	waitForExpiry(t, tokenExpiry)

	// Test that the existing connection still works after token would have expired
	assertPoolWorks(t, ctx, pool)
	connIdAfter := getConnectionID(t, ctx, pool)

	assert.Equal(t, connIdBefore, connIdAfter, "Connection IDs should match")
}

func TestLazyConnectionUsableAfterInitialInactivity(t *testing.T) {
	poolConfig := func(config *pgxpool.Config) {
		config.MaxConns = 1
		config.MinConns = 0
	}

	tokenExpiry, resetVar := configureTokenExpiry(t)
	defer resetVar()

	ctx := context.Background()
	pool, cancel, err := NewPool(ctx, poolConfig)
	assert.NoError(t, err)
	defer func() {
		pool.Close()
		cancel()
	}()

	waitForExpiry(t, tokenExpiry)

	// Test that a new connection works after token would have expired
	assertPoolWorks(t, ctx, pool)
}

func TestConnectionUsableAfterPoolReset(t *testing.T) {
	poolConfig := func(config *pgxpool.Config) {
		config.MaxConns = 1
		config.MinConns = 1
	}

	tokenExpiry, resetVar := configureTokenExpiry(t)
	defer resetVar()

	ctx := context.Background()
	pool, cancel, err := NewPool(ctx, poolConfig)
	assert.NoError(t, err)
	defer func() {
		pool.Close()
		cancel()
	}()

	assertPoolWorks(t, ctx, pool)
	connIdBefore := getConnectionID(t, ctx, pool)

	waitForExpiry(t, tokenExpiry)
	pool.Reset()

	// Test that a new connections works after the pool reset
	assertPoolWorks(t, ctx, pool)
	connIdAfter := getConnectionID(t, ctx, pool)

	assert.NotEqual(t, connIdBefore, connIdAfter, "Connection IDs should not match")
}

func TestNewConnectionAfterPoolExpiry(t *testing.T) {
	connectionExpiry := 2 * time.Second

	poolConfig := func(config *pgxpool.Config) {
		config.MaxConns = 1
		config.MinConns = 1
		config.MaxConnLifetime = connectionExpiry
	}

	ctx := context.Background()
	pool, cancel, err := NewPool(ctx, poolConfig)
	assert.NoError(t, err)
	defer func() {
		pool.Close()
		cancel()
	}()

	assertPoolWorks(t, ctx, pool)
	connIdBefore := getConnectionID(t, ctx, pool)

	waitForExpiry(t, connectionExpiry)

	// Test that a new connections is established after the connection expiry period
	assertPoolWorks(t, ctx, pool)
	connIdAfter := getConnectionID(t, ctx, pool)

	assert.NotEqual(t, connIdBefore, connIdAfter, "Connection IDs should not match")
}

func TestConnectionConcurrencyAfterTokenExpiry(t *testing.T) {
	numConnections := 20

	poolConfig := func(config *pgxpool.Config) {
		config.MaxConns = int32(numConnections)
		config.MinConns = 1
	}

	ctx := context.Background()
	pool, cancel, err := NewPool(ctx, poolConfig)
	assert.NoError(t, err)
	defer func() {
		pool.Close()
		cancel()
	}()

	assertPoolWorks(t, ctx, pool)
	initialConnId := getConnectionID(t, ctx, pool)
	t.Logf("Initial connection ID: %s", initialConnId)

	connIdCh := make(chan string, numConnections)
	errCh := make(chan error, numConnections)

	var wg sync.WaitGroup
	wg.Add(numConnections)

	// Start multiple goroutines that will each acquire a connection and hold it
	for i := 0; i < numConnections; i++ {
		go func(connIndex int) {
			defer wg.Done()

			// Run pg_sleep to hold the connection open to ensure concurrency.
			var connID string
			err := pool.QueryRow(ctx, "SELECT sys.current_session_id() FROM pg_sleep(5)").Scan(&connID)
			if err != nil {
				errCh <- err
			}

			connIdCh <- connID
		}(i)
	}

	// Close channels after all goroutines complete
	wg.Wait()
	close(errCh)
	close(connIdCh)

	// Fail the test if any of the goroutines failed
	for err := range errCh {
		t.Fatal(err)
	}

	connectionIDs := make(map[string]bool)
	for connID := range connIdCh {
		connectionIDs[connID] = true
		t.Logf("Connection ID: %s", connID)
	}

	assert.Equal(t, numConnections, len(connectionIDs), "Should have unique connection ID for each connection")
}

// TestCustomPoolConfiguration tests that the connection pool is configured with the configured parameters
func TestCustomPoolConfiguration(t *testing.T) {
	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	assert.NotEmpty(t, clusterEndpoint, "cluster endpoint must not be empty")

	clusterUser := os.Getenv("CLUSTER_USER")
	assert.NotEmpty(t, clusterUser, "cluster user must not be empty")

	resetPort := setAndCacheEnvVar(t, "DB_PORT", "5433")
	defer resetPort()

	resetDbName := setAndCacheEnvVar(t, "DB_NAME", "testdb")
	defer resetDbName()

	// Create a new pool with the custom configuration
	ctx := context.Background()
	pool, cancel, err := NewPool(ctx)
	assert.NoError(t, err)
	defer func() {
		pool.Close()
		cancel()
	}()

	config := pool.Config().ConnConfig

	assert.Equal(t, clusterEndpoint, config.Host)
	assert.Equal(t, clusterUser, config.User)
	assert.Equal(t, uint16(5433), config.Port)
	assert.Equal(t, "testdb", config.Database)
}

// TestCustomPoolConfiguration tests that the connection pool defaults are as expected
func TestDefaultPoolConfiguration(t *testing.T) {
	ctx := context.Background()
	pool, cancel, err := NewPool(ctx)
	assert.NoError(t, err)
	defer func() {
		pool.Close()
		cancel()
	}()

	config := pool.Config().ConnConfig

	assert.Equal(t, uint16(5432), config.Port)
	assert.Equal(t, "postgres", config.Database)
}
