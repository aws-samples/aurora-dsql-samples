package main

import (
	"context"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
)

func TestExample(t *testing.T) {
	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")

	if clusterEndpoint == "" || region == "" {
		t.Skip("Skipping test because CLUSTER_ENDPOINT or REGION environment variables are not set")
	}

	// Run the example
	err := example(clusterEndpoint, region)
	if err != nil {
		t.Errorf("Error running example: %v\n", err)
	}
}

func TestGenerateDbConnectAdminAuthToken(t *testing.T) {
	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")

	if clusterEndpoint == "" || region == "" {
		t.Skip("Skipping test because CLUSTER_ENDPOINT or REGION environment variables are not set")
	}

	// Create context and DSQL client
	ctx := context.Background()
	dsqlClient, err := NewDSQLClient(ctx, region)
	if err != nil {
		t.Errorf("Error creating DSQL client: %v\n", err)
		return
	}

	// Test token generation
	token, err := GenerateDbConnectAdminAuthToken(ctx, dsqlClient, clusterEndpoint, region)
	if err != nil {
		t.Errorf("Error generating auth token: %v\n", err)
	}

	if token == "" {
		t.Error("Generated token is empty")
	}
}

func TestNewPool(t *testing.T) {
	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")

	if clusterEndpoint == "" || region == "" {
		t.Skip("Skipping test because CLUSTER_ENDPOINT or REGION environment variables are not set")
	}

	// Create a new pool with token refresh
	ctx := context.Background()
	pool, err := NewPool(ctx, clusterEndpoint, region)
	if err != nil {
		t.Errorf("Error creating pool: %v\n", err)
		return
	}
	defer pool.Close()

	// Test connection
	err = pool.Pool.Ping(ctx)
	if err != nil {
		t.Errorf("Error pinging database: %v\n", err)
	}
}

// getConnectionID gets a unique identifier for a connection without using pg_backend_pid
func getConnectionID(ctx context.Context, pool *pgxpool.Pool) (string, error) {
	// Retrieve the session variable to confirm it was set
	var connID string
	err := pool.QueryRow(ctx, "select sys.current_session_id();").Scan(&connID)
	if err != nil {
		return "", err
	}

	return connID, nil
}

func TestTokenRefresh(t *testing.T) {
	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")

	if clusterEndpoint == "" || region == "" {
		t.Skip("Skipping test because CLUSTER_ENDPOINT or REGION environment variables are not set")
	}

	// Create a new pool with token refresh
	ctx := context.Background()
	pool, err := NewPool(ctx, clusterEndpoint, region)
	if err != nil {
		t.Errorf("Error creating pool: %v\n", err)
		return
	}
	defer pool.Close()

	// Get connection ID before refresh
	connIDBefore, err := getConnectionID(ctx, pool.Pool)
	if err != nil {
		t.Errorf("Error getting connection ID before refresh: %v\n", err)
		return
	}
	t.Logf("Connection ID before refresh: %s", connIDBefore)

	// Test manual token refresh
	err = pool.refreshToken()
	if err != nil {
		t.Errorf("Error refreshing token: %v\n", err)
		return
	}

	// Test connection after refresh
	err = pool.Pool.Ping(ctx)
	if err != nil {
		t.Errorf("Error pinging database after token refresh: %v\n", err)
		return
	}

	// Get connection ID after refresh
	connIDAfter, err := getConnectionID(ctx, pool.Pool)
	if err != nil {
		t.Errorf("Error getting connection ID after refresh: %v\n", err)
		return
	}
	t.Logf("Connection ID after refresh: %s", connIDAfter)

	// Verify that the connections are different
	if connIDBefore == connIDAfter {
		t.Errorf("Connection IDs before and after refresh are the same: %s", connIDBefore)
	} else {
		t.Logf("Successfully verified that connections before and after refresh are different")
	}
}

func TestMultipleConnectionsRefresh(t *testing.T) {
	// Skip test if environment variables are not set
	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")

	if clusterEndpoint == "" || region == "" {
		t.Skip("Skipping test because CLUSTER_ENDPOINT or REGION environment variables are not set")
	}

	// Create a new pool with token refresh
	ctx := context.Background()
	pool, err := NewPool(ctx, clusterEndpoint, region)
	if err != nil {
		t.Errorf("Error creating pool: %v\n", err)
		return
	}
	defer pool.Close()

	// Get multiple connection IDs before refresh
	connIDsBefore := make(map[string]bool)
	for i := 0; i < 3; i++ {
		conn, err := pool.Pool.Acquire(ctx)
		if err != nil {
			t.Errorf("Error acquiring connection %d before refresh: %v\n", i, err)
			return
		}

		var connID string
		err = conn.QueryRow(ctx, "select sys.current_session_id();").Scan(&connID)
		if err != nil {
			conn.Release()
			t.Errorf("Error getting connection ID %d before refresh: %v\n", i, err)
			return
		}

		connIDsBefore[connID] = true
		t.Logf("Connection ID %d before refresh: %s", i, connID)
		conn.Release()
	}

	// Test manual token refresh
	err = pool.refreshToken()
	if err != nil {
		t.Errorf("Error refreshing token: %v\n", err)
		return
	}

	// Get multiple connection IDs after refresh
	connIDsAfter := make(map[string]bool)
	for i := 0; i < 3; i++ {
		conn, err := pool.Pool.Acquire(ctx)
		if err != nil {
			t.Errorf("Error acquiring connection %d after refresh: %v\n", i, err)
			return
		}

		var connID string
		err = conn.QueryRow(ctx, "select sys.current_session_id();").Scan(&connID)
		if err != nil {
			conn.Release()
			t.Errorf("Error getting connection ID %d after refresh: %v\n", i, err)
			return
		}

		connIDsAfter[connID] = true
		t.Logf("Connection ID %d after refresh: %s", i, connID)
		conn.Release()
	}

	// Check if any connection IDs are the same before and after refresh
	for beforeID := range connIDsBefore {
		if connIDsAfter[beforeID] {
			t.Errorf("Found same connection ID before and after refresh: %s", beforeID)
			return
		}
	}

	t.Logf("Successfully verified that all connections before and after refresh are different")
}

func TestComprehensiveConnectionRefresh(t *testing.T) {
	// Skip test if environment variables are not set
	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")

	if clusterEndpoint == "" || region == "" {
		t.Skip("Skipping test because CLUSTER_ENDPOINT or REGION environment variables are not set")
	}

	// Create a new pool with token refresh
	ctx := context.Background()
	pool, err := NewPool(ctx, clusterEndpoint, region)
	if err != nil {
		t.Errorf("Error creating pool: %v\n", err)
		return
	}
	defer pool.Close()

	// Get the initial pool stats
	initialStats := pool.Pool.Stat()
	t.Logf("Initial pool stats: Total=%d, Idle=%d, InUse=%d",
		initialStats.TotalConns(), initialStats.IdleConns(), initialStats.AcquiredConns())

	// Create a map to store connection IDs before refresh
	connIDsBefore := make(map[string]bool)

	// Acquire all possible connections and get their IDs
	maxConns := 5 // Use a reasonable number for testing
	conns := make([]*pgxpool.Conn, 0, maxConns)

	for i := 0; i < maxConns; i++ {
		conn, err := pool.Pool.Acquire(ctx)
		if err != nil {
			t.Logf("Acquired %d connections before hitting limit", i)
			break
		}
		conns = append(conns, conn)

		var connID string
		err = conn.QueryRow(ctx, "select sys.current_session_id();").Scan(&connID)
		if err != nil {
			t.Errorf("Error getting connection ID for conn %d: %v", i, err)
			continue
		}

		connIDsBefore[connID] = true
		t.Logf("Connection %d before refresh: ID=%s", i, connID)
	}

	// Release all connections back to the pool
	for _, conn := range conns {
		conn.Release()
	}
	conns = nil

	// Get pool stats before refresh
	beforeStats := pool.Pool.Stat()
	t.Logf("Pool stats before refresh: Total=%d, Idle=%d, InUse=%d",
		beforeStats.TotalConns(), beforeStats.IdleConns(), beforeStats.AcquiredConns())

	// Perform token refresh
	t.Log("Performing token refresh...")
	err = pool.refreshToken()
	if err != nil {
		t.Errorf("Error refreshing token: %v", err)
		return
	}

	// Get pool stats after refresh
	afterStats := pool.Pool.Stat()
	t.Logf("Pool stats after refresh: Total=%d, Idle=%d, InUse=%d",
		afterStats.TotalConns(), afterStats.IdleConns(), afterStats.AcquiredConns())

	// Create a map to store connection IDs after refresh
	connIDsAfter := make(map[string]bool)

	// Acquire connections from the refreshed pool
	conns = make([]*pgxpool.Conn, 0, maxConns)
	for i := 0; i < maxConns; i++ {
		conn, err := pool.Pool.Acquire(ctx)
		if err != nil {
			t.Logf("Acquired %d connections before hitting limit", i)
			break
		}
		conns = append(conns, conn)

		var connID string
		err = conn.QueryRow(ctx, "select sys.current_session_id();").Scan(&connID)
		if err != nil {
			t.Errorf("Error getting connection ID for conn %d: %v", i, err)
			continue
		}

		connIDsAfter[connID] = true
		t.Logf("Connection %d after refresh: ID=%s", i, connID)
	}

	// Release all connections
	for _, conn := range conns {
		conn.Release()
	}

	// Check if any connection IDs are the same before and after refresh
	sameConnections := 0
	for beforeID := range connIDsBefore {
		if connIDsAfter[beforeID] {
			sameConnections++
			t.Logf("Found same connection ID before and after refresh: %s", beforeID)
		}
	}

	if sameConnections > 0 {
		t.Errorf("Found %d connections that were the same before and after refresh", sameConnections)
	} else {
		t.Logf("Successfully verified that all %d connections before and after refresh are different", len(connIDsBefore))
	}
}

// TestGetEnv tests the getEnv utility function
func TestGetEnv(t *testing.T) {
	// Save original environment variable if it exists
	originalValue, originalExists := os.LookupEnv("TEST_ENV_VAR")

	// Test with environment variable set
	os.Setenv("TEST_ENV_VAR", "test_value")
	result := getEnv("TEST_ENV_VAR", "default_value")
	assert.Equal(t, "test_value", result, "Should return the environment variable value when set")

	// Test with environment variable not set
	os.Unsetenv("TEST_ENV_VAR")
	result = getEnv("TEST_ENV_VAR", "default_value")
	assert.Equal(t, "default_value", result, "Should return the default value when environment variable is not set")

	// Restore original environment variable if it existed
	if originalExists {
		os.Setenv("TEST_ENV_VAR", originalValue)
	} else {
		os.Unsetenv("TEST_ENV_VAR")
	}
}

// TestGetEnvInt tests the getEnvInt utility function
func TestGetEnvInt(t *testing.T) {
	// Save original environment variable if it exists
	originalValue, originalExists := os.LookupEnv("TEST_ENV_INT")

	// Test with valid integer environment variable
	os.Setenv("TEST_ENV_INT", "123")
	result := getEnvInt("TEST_ENV_INT", 456)
	assert.Equal(t, 123, result, "Should return the integer value from environment variable")

	// Test with invalid integer environment variable
	os.Setenv("TEST_ENV_INT", "not_an_int")
	result = getEnvInt("TEST_ENV_INT", 456)
	assert.Equal(t, 456, result, "Should return the default value when environment variable is not a valid integer")

	// Test with environment variable not set
	os.Unsetenv("TEST_ENV_INT")
	result = getEnvInt("TEST_ENV_INT", 456)
	assert.Equal(t, 456, result, "Should return the default value when environment variable is not set")

	// Restore original environment variable if it existed
	if originalExists {
		os.Setenv("TEST_ENV_INT", originalValue)
	} else {
		os.Unsetenv("TEST_ENV_INT")
	}
}

// TestGetConnectionID tests the GetConnectionID method of the Pool struct
func TestGetConnectionID(t *testing.T) {
	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")

	if clusterEndpoint == "" || region == "" {
		t.Skip("Skipping test because CLUSTER_ENDPOINT or REGION environment variables are not set")
	}

	// Create a new pool
	ctx := context.Background()
	pool, err := NewPool(ctx, clusterEndpoint, region)
	if err != nil {
		t.Errorf("Error creating pool: %v\n", err)
		return
	}
	defer pool.Close()

	// Test GetConnectionID method
	connID, err := pool.GetConnectionID(ctx)
	if err != nil {
		t.Errorf("Error getting connection ID: %v\n", err)
		return
	}

	// Verify that the connection ID is not empty
	assert.NotEmpty(t, connID, "Connection ID should not be empty")
	t.Logf("Connection ID: %s", connID)
}

// TestDemonstrateConnectionRefresh tests the DemonstrateConnectionRefresh method
func TestDemonstrateConnectionRefresh(t *testing.T) {
	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")

	if clusterEndpoint == "" || region == "" {
		t.Skip("Skipping test because CLUSTER_ENDPOINT or REGION environment variables are not set")
	}

	// Create a new pool
	ctx := context.Background()
	pool, err := NewPool(ctx, clusterEndpoint, region)
	if err != nil {
		t.Errorf("Error creating pool: %v\n", err)
		return
	}
	defer pool.Close()

	// Test DemonstrateConnectionRefresh method
	err = pool.DemonstrateConnectionRefresh(ctx)
	assert.NoError(t, err, "DemonstrateConnectionRefresh should not return an error")
}

// TestGetConnectionPool tests the getConnectionPool function
func TestGetConnectionPool(t *testing.T) {
	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")

	if clusterEndpoint == "" || region == "" {
		t.Skip("Skipping test because CLUSTER_ENDPOINT or REGION environment variables are not set")
	}

	// Test getConnectionPool function
	ctx := context.Background()
	pool, err := getConnectionPool(ctx, clusterEndpoint, region)
	assert.NoError(t, err, "getConnectionPool should not return an error")
	assert.NotNil(t, pool, "Connection pool should not be nil")

	// Test that the pool is functional
	err = pool.Ping(ctx)
	assert.NoError(t, err, "Pool should be able to ping the database")

	// Clean up
	pool.Close()
}

// TestDatabaseOperations tests the database operations in the example function
func TestDatabaseOperations(t *testing.T) {
	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")

	if clusterEndpoint == "" || region == "" {
		t.Skip("Skipping test because CLUSTER_ENDPOINT or REGION environment variables are not set")
	}

	// Create a new pool
	ctx := context.Background()
	pool, err := NewPool(ctx, clusterEndpoint, region)
	if err != nil {
		t.Errorf("Error creating pool: %v\n", err)
		return
	}
	defer pool.Close()

	// Create owner table
	_, err = pool.Pool.Exec(ctx, `
                CREATE TABLE IF NOT EXISTS owner (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        name VARCHAR(255),
                        city VARCHAR(255),
                        telephone VARCHAR(255)
                )
        `)
	assert.NoError(t, err, "Should be able to create owner table")

	// Generate a unique test name to avoid conflicts with other test runs
	testName := "Test User " + time.Now().Format("20060102150405")
	testCity := "Test City"
	testPhone := "555-123-4567"
	testID := uuid.New()

	// Test INSERT operation
	_, err = pool.Pool.Exec(ctx,
		`INSERT INTO owner (id, name, city, telephone) VALUES ($1, $2, $3, $4)`,
		testID, testName, testCity, testPhone)
	assert.NoError(t, err, "Should be able to insert a record")

	// Test SELECT operation
	var retrievedOwner Owner
	err = pool.Pool.QueryRow(ctx,
		`SELECT id, name, city, telephone FROM owner WHERE id = $1`,
		testID).Scan(&retrievedOwner.Id, &retrievedOwner.Name, &retrievedOwner.City, &retrievedOwner.Telephone)
	assert.NoError(t, err, "Should be able to select the inserted record")

	// Verify the retrieved data
	assert.Equal(t, testID.String(), retrievedOwner.Id, "Retrieved ID should match inserted ID")
	assert.Equal(t, testName, retrievedOwner.Name, "Retrieved name should match inserted name")
	assert.Equal(t, testCity, retrievedOwner.City, "Retrieved city should match inserted city")
	assert.Equal(t, testPhone, retrievedOwner.Telephone, "Retrieved telephone should match inserted telephone")

	// Test UPDATE operation
	updatedCity := "Updated City"
	_, err = pool.Pool.Exec(ctx,
		`UPDATE owner SET city = $1 WHERE id = $2`,
		updatedCity, testID)
	assert.NoError(t, err, "Should be able to update a record")

	// Verify the update
	err = pool.Pool.QueryRow(ctx,
		`SELECT city FROM owner WHERE id = $1`,
		testID).Scan(&retrievedOwner.City)
	assert.NoError(t, err, "Should be able to select the updated record")
	assert.Equal(t, updatedCity, retrievedOwner.City, "Retrieved city should match updated city")

	// Test DELETE operation
	_, err = pool.Pool.Exec(ctx,
		`DELETE FROM owner WHERE id = $1`,
		testID)
	assert.NoError(t, err, "Should be able to delete a record")

	// Verify the deletion
	var count int
	err = pool.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM owner WHERE id = $1`,
		testID).Scan(&count)
	assert.NoError(t, err, "Should be able to count records")
	assert.Equal(t, 0, count, "Record should be deleted")

	// Clean up - drop the table if needed
	// Uncomment if you want to drop the table after the test
	// _, err = pool.Pool.Exec(ctx, `DROP TABLE IF EXISTS owner`)
	// assert.NoError(t, err, "Should be able to drop the table")

}

// TestPeriodicTokenRefresh tests the automatic token refresh mechanism
func TestPeriodicTokenRefresh(t *testing.T) {
	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")

	if clusterEndpoint == "" || region == "" {
		t.Skip("Skipping test because CLUSTER_ENDPOINT or REGION environment variables are not set")
	}

	// Set a very short token refresh interval for testing (3 seconds)
	os.Setenv("TOKEN_REFRESH_INTERVAL", "3")
	defer os.Unsetenv("TOKEN_REFRESH_INTERVAL")

	// Create a new pool with the short refresh interval
	ctx := context.Background()
	pool, err := NewPool(ctx, clusterEndpoint, region)
	if err != nil {
		t.Errorf("Error creating pool: %v\n", err)
		return
	}
	defer pool.Close()

	// Get connection ID before automatic refresh
	connIDBefore, err := pool.GetConnectionID(ctx)
	if err != nil {
		t.Errorf("Error getting connection ID before refresh: %v\n", err)
		return
	}
	t.Logf("Connection ID before automatic refresh: %s", connIDBefore)

	// Wait for the automatic token refresh to occur (75% of 3 seconds = ~2.25 seconds)
	// We'll wait 3 seconds to be safe
	t.Log("Waiting for automatic token refresh...")
	time.Sleep(3 * time.Second)

	// Get connection ID after automatic refresh
	connIDAfter, err := pool.GetConnectionID(ctx)
	if err != nil {
		t.Errorf("Error getting connection ID after refresh: %v\n", err)
		return
	}
	t.Logf("Connection ID after automatic refresh: %s", connIDAfter)

	// Verify that the connections are different
	if connIDBefore == connIDAfter {
		t.Errorf("Connection IDs before and after automatic refresh are the same: %s", connIDBefore)
	} else {
		t.Logf("Successfully verified that connections before and after automatic refresh are different")
	}
}

// TestConcurrentConnections tests concurrent use of the connection pool
func TestConcurrentConnections(t *testing.T) {
	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")

	if clusterEndpoint == "" || region == "" {
		t.Skip("Skipping test because CLUSTER_ENDPOINT or REGION environment variables are not set")
	}

	// Create a new pool
	ctx := context.Background()
	pool, err := NewPool(ctx, clusterEndpoint, region)
	if err != nil {
		t.Errorf("Error creating pool: %v\n", err)
		return
	}
	defer pool.Close()

	// Create owner table if it doesn't exist
	_, err = pool.Pool.Exec(ctx, `
                CREATE TABLE IF NOT EXISTS owner (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        name VARCHAR(255),
                        city VARCHAR(255),
                        telephone VARCHAR(255)
                )
        `)
	assert.NoError(t, err, "Should be able to create owner table")

	// Number of concurrent operations
	numConcurrent := 10
	var wg sync.WaitGroup
	wg.Add(numConcurrent)

	// Channel to collect errors
	errorChan := make(chan error, numConcurrent)

	// Run concurrent operations
	for i := 0; i < numConcurrent; i++ {
		go func(index int) {
			defer wg.Done()

			// Generate unique data for this goroutine
			testID := uuid.New()
			testName := fmt.Sprintf("Concurrent User %d", index)
			testCity := fmt.Sprintf("City %d", index)
			testPhone := fmt.Sprintf("555-555-%04d", index)

			// Insert a record
			_, err := pool.Pool.Exec(ctx,
				`INSERT INTO owner (id, name, city, telephone) VALUES ($1, $2, $3, $4)`,
				testID, testName, testCity, testPhone)
			if err != nil {
				errorChan <- fmt.Errorf("goroutine %d insert error: %v", index, err)
				return
			}

			// Query the record
			var retrievedOwner Owner
			err = pool.Pool.QueryRow(ctx,
				`SELECT id, name, city, telephone FROM owner WHERE id = $1`,
				testID).Scan(&retrievedOwner.Id, &retrievedOwner.Name, &retrievedOwner.City, &retrievedOwner.Telephone)
			if err != nil {
				errorChan <- fmt.Errorf("goroutine %d query error: %v", index, err)
				return
			}

			// Verify the data
			if retrievedOwner.Name != testName || retrievedOwner.City != testCity || retrievedOwner.Telephone != testPhone {
				errorChan <- fmt.Errorf("goroutine %d data mismatch: expected %s/%s/%s, got %s/%s/%s",
					index, testName, testCity, testPhone,
					retrievedOwner.Name, retrievedOwner.City, retrievedOwner.Telephone)
				return
			}

			// Delete the record
			_, err = pool.Pool.Exec(ctx,
				`DELETE FROM owner WHERE id = $1`,
				testID)
			if err != nil {
				errorChan <- fmt.Errorf("goroutine %d delete error: %v", index, err)
				return
			}
		}(i)
	}

	// Wait for all goroutines to complete
	wg.Wait()
	close(errorChan)

	// Check for errors
	var errors []error
	for err := range errorChan {
		errors = append(errors, err)
	}

	// Report any errors
	if len(errors) > 0 {
		for _, err := range errors {
			t.Errorf("%v", err)
		}
		t.Errorf("Concurrent operations had %d errors", len(errors))
	} else {
		t.Logf("Successfully completed %d concurrent operations", numConcurrent)
	}
}

// TestPoolConfiguration tests that the connection pool is configured with the expected parameters
func TestPoolConfiguration(t *testing.T) {
	// Save original environment variables
	origClusterUser := os.Getenv("CLUSTER_USER")
	origDbPort := os.Getenv("DB_PORT")
	origDbName := os.Getenv("DB_NAME")
	origTokenRefreshInterval := os.Getenv("TOKEN_REFRESH_INTERVAL")

	// Set test environment variables
	os.Setenv("CLUSTER_USER", "testuser")
	os.Setenv("DB_PORT", "5433")
	os.Setenv("DB_NAME", "testdb")
	os.Setenv("TOKEN_REFRESH_INTERVAL", "600")

	// Defer restoring original environment variables
	defer func() {
		if origClusterUser != "" {
			os.Setenv("CLUSTER_USER", origClusterUser)
		} else {
			os.Unsetenv("CLUSTER_USER")
		}

		if origDbPort != "" {
			os.Setenv("DB_PORT", origDbPort)
		} else {
			os.Unsetenv("DB_PORT")
		}

		if origDbName != "" {
			os.Setenv("DB_NAME", origDbName)
		} else {
			os.Unsetenv("DB_NAME")
		}

		if origTokenRefreshInterval != "" {
			os.Setenv("TOKEN_REFRESH_INTERVAL", origTokenRefreshInterval)
		} else {
			os.Unsetenv("TOKEN_REFRESH_INTERVAL")
		}
	}()

	clusterEndpoint := os.Getenv("CLUSTER_ENDPOINT")
	region := os.Getenv("REGION")

	if clusterEndpoint == "" || region == "" {
		t.Skip("Skipping test because CLUSTER_ENDPOINT or REGION environment variables are not set")
	}

	// Create a new pool with the custom configuration
	ctx := context.Background()
	pool, err := NewPool(ctx, clusterEndpoint, region)
	if err != nil {
		t.Errorf("Error creating pool: %v\n", err)
		return
	}
	defer pool.Close()

	// Verify the configuration
	assert.Equal(t, "testuser", pool.config.User, "User should match environment variable")
	assert.Equal(t, "5433", pool.config.Port, "Port should match environment variable")
	assert.Equal(t, "testdb", pool.config.Database, "Database should match environment variable")
	assert.Equal(t, 600, pool.config.TokenRefreshInterval, "Token refresh interval should match environment variable")
	assert.Equal(t, region, pool.config.Region, "Region should match input parameter")
	assert.Equal(t, clusterEndpoint, pool.config.Host, "Host should match input parameter")

	// Test default values by unsetting environment variables
	os.Unsetenv("CLUSTER_USER")
	os.Unsetenv("DB_PORT")
	os.Unsetenv("DB_NAME")
	os.Unsetenv("TOKEN_REFRESH_INTERVAL")

	// Create another pool with default configuration
	pool2, err := NewPool(ctx, clusterEndpoint, region)
	if err != nil {
		t.Errorf("Error creating pool with default config: %v\n", err)
		return
	}
	defer pool2.Close()

	// Verify default configuration
	assert.Equal(t, "admin", pool2.config.User, "Default user should be 'admin'")
	assert.Equal(t, "5432", pool2.config.Port, "Default port should be '5432'")
	assert.Equal(t, "postgres", pool2.config.Database, "Default database should be 'postgres'")
	assert.Equal(t, 900, pool2.config.TokenRefreshInterval, "Default token refresh interval should be 900 seconds")
}
