package main

import (
	"context"
	"fmt"
	_ "github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dsql/auth"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
)

type Owner struct {
	Id        string `json:"id"`
	Name      string `json:"name"`
	City      string `json:"city"`
	Telephone string `json:"telephone"`
}

// Config holds database connection parameters
type Config struct {
	Host         string
	Port         string
	User         string
	Password     string
	Database     string
	UseIAM       bool
	Region       string
	RefreshToken bool
}

// Pool represents a connection pool to the database
type Pool struct {
	Pool       *pgxpool.Pool
	config     Config
	ctx        context.Context
	cancelFunc context.CancelFunc
}

func GenerateDbConnectAdminAuthToken(clusterEndpoint string, region string, action string) (string, error) {
	ctx := context.Background()
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return "", err
	}

	token, err := auth.GenerateDBConnectAdminAuthToken(ctx, clusterEndpoint, region, cfg.Credentials)
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

func getConnectionPool(ctx context.Context, clusterEndpoint string, region string) (*pgxpool.Pool, error) {

	clusterUserID := os.Getenv("CLUSTER_USER")
	dbConfig := Config{
		Host:         getEnv("DB_HOST", clusterEndpoint),
		Port:         getEnv("DB_PORT", "5432"),
		User:         getEnv("DB_USER", clusterUserID),
		Password:     getEnv("DB_PASSWORD", ""),
		Database:     getEnv("DB_NAME", "postgres"),
		UseIAM:       getEnvBool("DB_USE_IAM", false),
		Region:       getEnv("AWS_REGION", "us-east-1"),
		RefreshToken: getEnvBool("DB_REFRESH_TOKEN", true),
	}
	// Build connection URL
	var sb strings.Builder
	sb.WriteString("postgres://")
	sb.WriteString(clusterEndpoint)
	sb.WriteString(":5432/postgres?user=admin&sslmode=verify-full")
	url := sb.String()

	// The token expiration time is optional, and the default value 900 seconds
	// If you are not connecting as admin, use DbConnect action instead
	token, err := GenerateDbConnectAdminAuthToken(clusterEndpoint, region, "DbConnectAdmin")
	if err != nil {
		return nil, err
	}

	poolConfig, err := pgxpool.ParseConfig(url)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to parse pool config: %v\n", err)
		return nil, err
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
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to create connection pool: %v\n", err)
		return nil, err
	}

	return pool, nil
}

func example(clusterEndpoint string, region string) error {
	ctx := context.Background()

	// Establish connection pool
	pool, err := getConnectionPool(ctx, clusterEndpoint, region)
	if err != nil {
		return err
	}
	defer pool.Close()

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
