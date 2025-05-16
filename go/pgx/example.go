package main

import (
	"context"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dsql/auth"
	"github.com/aws/aws-sdk-go-v2/service/dsql"
	"github.com/jackc/pgx/v5"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Owner struct {
	Id        string `json:"id"`
	Name      string `json:"name"`
	City      string `json:"city"`
	Telephone string `json:"telephone"`
}

// Config holds database connection parameters
type Config struct {
	Host     string
	Port     string
	User     string
	Password string
	Database string
	Region   string
	// Token refresh interval in seconds (default: 15 minutes)
	TokenRefreshInterval int
}

// Pool represents a connection pool to the database with token refresh capability
type Pool struct {
	Pool            *pgxpool.Pool
	config          Config
	ctx             context.Context
	cancelFunc      context.CancelFunc
	dsqlClient      *dsql.Client
	clusterEndpoint string
	mu              sync.Mutex
}

// NewDSQLClient creates a new DSQL client using AWS configuration
func NewDSQLClient(ctx context.Context, region string) (*dsql.Client, error) {
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS configuration: %v", err)
	}

	// Create a DSQL client using NewFromConfig
	dsqlClient := dsql.NewFromConfig(cfg, func(o *dsql.Options) {
		// For internal test only not required for prod.
		o.Region = region
	})

	return dsqlClient, nil
}

// GenerateDbConnectAuthToken generates an authentication token for database connection
func GenerateDbConnectAuthToken(ctx context.Context, clusterEndpoint, region, user string) (string, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return "", err
	}

	if user == "admin" {
		token, err := auth.GenerateDBConnectAdminAuthToken(ctx, clusterEndpoint, region, cfg.Credentials)
		if err != nil {
			return "", err
		}

		return token, nil
	}

	token, err := auth.GenerateDbConnectAuthToken(ctx, clusterEndpoint, region, cfg.Credentials)
	if err != nil {
		return "", err
	}

	return token, nil
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

func getEnvInt(key string, defaultValue int) int {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	intValue, err := strconv.Atoi(value)
	if err != nil {
		return defaultValue
	}
	return intValue
}

// NewPool creates a new database connection pool with token refresh capability
func NewPool(ctx context.Context, clusterEndpoint string, region string) (*Pool, error) {
	// Create a cancellable context for the pool
	poolCtx, cancel := context.WithCancel(ctx)

	// Create DSQL client
	client, err := NewDSQLClient(poolCtx, region)
	if err != nil {
		cancel()
		return nil, fmt.Errorf("failed to create DSQL client: %v", err)
	}

	// Get configuration from environment variables
	dbConfig := Config{
		Host:                 clusterEndpoint,
		Port:                 getEnv("DB_PORT", "5432"),
		User:                 getEnv("CLUSTER_USER", "admin"),
		Password:             "",
		Database:             getEnv("DB_NAME", "postgres"),
		Region:               region,
		TokenRefreshInterval: getEnvInt("TOKEN_REFRESH_INTERVAL", 900), // Default to 15 minutes
	}

	// Generate initial token
	token, err := GenerateDbConnectAuthToken(poolCtx, clusterEndpoint, region, dbConfig.User)
	if err != nil {
		cancel()
		return nil, fmt.Errorf("failed to generate auth token: %v", err)
	}

	// Build connection URL
	var sb strings.Builder
	sb.WriteString("postgres://")
	sb.WriteString(dbConfig.User)
	sb.WriteString("@")
	sb.WriteString(dbConfig.Host)
	sb.WriteString(":")
	sb.WriteString(dbConfig.Port)
	sb.WriteString("/")
	sb.WriteString(dbConfig.Database)
	sb.WriteString("?sslmode=verify-full")
	url := sb.String()

	poolConfig, err := pgxpool.ParseConfig(url)
	if err != nil {
		cancel()
		return nil, fmt.Errorf("unable to parse pool config: %v", err)
	}

	// To avoid issues with parse config set the password directly in config
	poolConfig.ConnConfig.Password = token

	// Configure pool settings
	poolConfig.MaxConns = 10
	poolConfig.MinConns = 2
	poolConfig.MaxConnLifetime = 1 * time.Hour
	poolConfig.MaxConnIdleTime = 30 * time.Minute
	poolConfig.HealthCheckPeriod = 1 * time.Minute

	// Create the connection pool
	pgxPool, err := pgxpool.NewWithConfig(poolCtx, poolConfig)
	if err != nil {
		cancel()
		return nil, fmt.Errorf("unable to create connection pool: %v", err)
	}

	pool := &Pool{
		Pool:            pgxPool,
		config:          dbConfig,
		ctx:             poolCtx,
		cancelFunc:      cancel,
		dsqlClient:      client,
		clusterEndpoint: clusterEndpoint,
	}

	// Start token refresh goroutine if enabled
	go pool.refreshTokenPeriodically()

	return pool, nil
}

// refreshTokenPeriodically refreshes the authentication token at regular intervals
func (p *Pool) refreshTokenPeriodically() {
	// Calculate refresh interval (75% of token lifetime to refresh before expiration)
	refreshInterval := time.Duration(p.config.TokenRefreshInterval) * time.Second * 3 / 4

	ticker := time.NewTicker(refreshInterval)
	defer ticker.Stop()

	for {
		select {
		case <-p.ctx.Done():
			return
		case <-ticker.C:
			if err := p.refreshToken(); err != nil {
				fmt.Fprintf(os.Stderr, "Error refreshing token: %v\n", err)
			}
		}
	}
}

// refreshToken generates a new token and updates the connection pool
func (p *Pool) refreshToken() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	// Generate new token
	token, err := GenerateDbConnectAuthToken(p.ctx, p.clusterEndpoint, p.config.Region, p.config.User)
	if err != nil {
		return fmt.Errorf("failed to refresh auth token: %v", err)
	}

	// Update all connections in the pool with the new token
	conns := p.Pool.Stat().TotalConns()

	// Reset the pool to force new connections with the updated token
	p.Pool.Reset()

	// Create a new connection config with the updated token
	var sb strings.Builder
	sb.WriteString("postgres://")
	sb.WriteString(p.config.User)
	sb.WriteString("@")
	sb.WriteString(p.config.Host)
	sb.WriteString(":")
	sb.WriteString(p.config.Port)
	sb.WriteString("/")
	sb.WriteString(p.config.Database)
	sb.WriteString("?sslmode=verify-full")
	url := sb.String()

	poolConfig, err := pgxpool.ParseConfig(url)
	if err != nil {
		return fmt.Errorf("unable to parse pool config during token refresh: %v", err)
	}

	// Update the password with the new token
	poolConfig.ConnConfig.Password = token

	// Configure pool settings
	poolConfig.MaxConns = 10
	poolConfig.MinConns = 2
	poolConfig.MaxConnLifetime = 1 * time.Hour
	poolConfig.MaxConnIdleTime = 30 * time.Minute
	poolConfig.HealthCheckPeriod = 1 * time.Minute

	// Create a new pool with the updated token
	newPool, err := pgxpool.NewWithConfig(p.ctx, poolConfig)
	if err != nil {
		return fmt.Errorf("unable to create new connection pool during token refresh: %v", err)
	}

	// Replace the old pool with the new one
	oldPool := p.Pool
	p.Pool = newPool

	// Close the old pool
	oldPool.Close()

	fmt.Printf("Successfully refreshed token and updated %d connections\n", conns)
	return nil
}

// Close closes the connection pool and cancels the refresh goroutine
func (p *Pool) Close() {
	p.cancelFunc()
	p.Pool.Close()
}

// GetConnectionID returns a unique identifier for a connection in the pool
func (p *Pool) GetConnectionID(ctx context.Context) (string, error) {
	// Retrieve the session variable to confirm it was set
	var connID string
	err := p.Pool.QueryRow(ctx, "select sys.current_session_id();").Scan(&connID)
	if err != nil {
		return "", fmt.Errorf("failed to get connection ID: %v", err)
	}
	return connID, nil
}

// DemonstrateConnectionRefresh shows that connections before and after refresh are different
func (p *Pool) DemonstrateConnectionRefresh(ctx context.Context) error {
	// Get connection ID before refresh
	connIDBefore, err := p.GetConnectionID(ctx)
	if err != nil {
		return err
	}
	fmt.Printf("Connection ID before refresh: %s\n", connIDBefore)

	// Refresh token
	err = p.refreshToken()
	if err != nil {
		return fmt.Errorf("failed to refresh token: %v", err)
	}

	// Get connection ID after refresh
	connIDAfter, err := p.GetConnectionID(ctx)
	if err != nil {
		return err
	}
	fmt.Printf("Connection ID after refresh: %s\n", connIDAfter)

	// Verify that the connections are different
	if connIDBefore == connIDAfter {
		return fmt.Errorf("connection IDs before and after refresh are the same: %s", connIDBefore)
	}

	fmt.Println("Successfully verified that connections before and after refresh are different")
	return nil
}

// GetConnectionPool creates a new connection pool with token refresh capability
func getConnectionPool(ctx context.Context, clusterEndpoint string, region string) (*pgxpool.Pool, error) {
	pool, err := NewPool(ctx, clusterEndpoint, region)
	if err != nil {
		return nil, err
	}

	// Return just the pgxpool.Pool to maintain compatibility with existing code
	return pool.Pool, nil
}

func example(clusterEndpoint string, region string) error {
	ctx := context.Background()

	// Establish connection pool
	poolWrapper, err := NewPool(ctx, clusterEndpoint, region)
	if err != nil {
		return err
	}
	defer poolWrapper.Close()

	pool := poolWrapper.Pool

	// Ping the database to verify connection
	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("unable to ping database: %v", err)
	}

	// Create owner table
	_, err = pool.Exec(ctx, `
                CREATE TABLE IF NOT EXISTS owner (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        name VARCHAR(255),
                        city VARCHAR(255),
                        telephone VARCHAR(255)
                )
        `)
	if err != nil {
		return err
	}

	// insert data
	query := `INSERT INTO owner (id, name, city, telephone) VALUES ($1, $2, $3, $4)`
	_, err = pool.Exec(ctx, query, uuid.New(), "John Doe", "Anytown", "555-555-0150")
	if err != nil {
		return err
	}

	owners := []Owner{}
	// Define the SQL query to insert a new owner record.
	query = `SELECT id, name, city, telephone FROM owner where name='John Doe'`

	rows, err := pool.Query(ctx, query)
	if err != nil {
		return err
	}
	defer rows.Close()

	owners, err = pgx.CollectRows(rows, pgx.RowToStructByName[Owner])
	fmt.Println(owners)
	if err != nil || owners[0].Name != "John Doe" || owners[0].City != "Anytown" {
		panic("Error retrieving data")
	}

	_, err = pool.Exec(ctx, `DELETE FROM owner where name='John Doe'`)
	if err != nil {
		return err
	}

	// Demonstrate that connections before and after refresh are different
	fmt.Println("\n--- Demonstrating connection refresh ---")
	err = poolWrapper.DemonstrateConnectionRefresh(ctx)
	if err != nil {
		return fmt.Errorf("connection refresh demonstration failed: %v", err)
	}
	fmt.Println("--- End of connection refresh demonstration ---")

	return nil
}

// Run example
func main() {
	err := example(os.Getenv("CLUSTER_ENDPOINT"), os.Getenv("REGION"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to run example: %v\n", err)
		os.Exit(1)
	}
}
