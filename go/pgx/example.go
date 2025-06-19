package main

import (
	"context"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dsql/auth"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"log"
	"os"
	"strconv"
	"strings"
	"time"
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
}

// GenerateDbConnectAuthToken generates an authentication token for database connection
func GenerateDbConnectAuthToken(
	ctx context.Context, clusterEndpoint, region, user string, expiry time.Duration,
) (string, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return "", err
	}

	tokenOptions := func(options *auth.TokenOptions) {
		options.ExpiresIn = expiry
	}

	if user == "admin" {
		token, err := auth.GenerateDBConnectAdminAuthToken(ctx, clusterEndpoint, region, cfg.Credentials, tokenOptions)
		if err != nil {
			return "", err
		}

		return token, nil
	}

	token, err := auth.GenerateDbConnectAuthToken(ctx, clusterEndpoint, region, cfg.Credentials, tokenOptions)
	if err != nil {
		return "", err
	}

	return token, nil
}

func CreateConnectionURL(dbConfig Config) string {
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
	sb.WriteString("&sslnegotiation=direct")
	url := sb.String()
	return url
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

func getEnvOrThrow(key string) string {
	value := os.Getenv(key)
	if value == "" {
		panic(fmt.Errorf("environment variable %s not set", key))
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
func NewPool(
	ctx context.Context, poolOptFns ...func(options *pgxpool.Config),
) (*pgxpool.Pool, context.CancelFunc, error) {
	// Create a cancellable context for the pool
	poolCtx, cancel := context.WithCancel(ctx)

	// Get configuration from environment variables
	dbConfig := Config{
		Host:     getEnvOrThrow("CLUSTER_ENDPOINT"),
		User:     getEnvOrThrow("CLUSTER_USER"),
		Region:   getEnvOrThrow("REGION"),
		Port:     getEnv("DB_PORT", "5432"),
		Database: getEnv("DB_NAME", "postgres"),
		Password: "",
	}

	// This doesn't need to be configurable for most applications, but we allow
	// configuration here for the sake of unit testing. Default token expiry is
	// longer, but we intend to use the token immediately after it is generated.
	expirySeconds := getEnvInt("TOKEN_EXPIRY_SECS", 30)
	expiry := time.Duration(expirySeconds) * time.Second

	url := CreateConnectionURL(dbConfig)

	poolConfig, err := pgxpool.ParseConfig(url)
	if err != nil {
		cancel()
		return nil, nil, fmt.Errorf("unable to parse pool config: %v", err)
	}

	poolConfig.BeforeConnect = func(ctx context.Context, cfg *pgx.ConnConfig) error {
		token, err := GenerateDbConnectAuthToken(ctx, dbConfig.Host, dbConfig.Region, dbConfig.User, expiry)
		if err != nil {
			return fmt.Errorf("failed to generate auth token: %w", err)
		}

		cfg.Password = token
		return nil
	}

	poolConfig.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		user := conn.Config().User

		var schema string
		if user == "admin" {
			schema = "public"
		} else {
			schema = "myschema"
		}

		_, err := conn.Exec(ctx, fmt.Sprintf("SET search_path = %s", schema))
		if err != nil {
			return fmt.Errorf("failed to set search_path to %s: %w", schema, err)
		}

		return nil
	}

	poolConfig.MaxConns = 10
	poolConfig.MinConns = 2
	poolConfig.MaxConnLifetime = 1 * time.Hour
	poolConfig.MaxConnIdleTime = 30 * time.Minute
	poolConfig.HealthCheckPeriod = 1 * time.Minute

	// Allow  the pool settings to be overridden.
	for _, fn := range poolOptFns {
		fn(poolConfig)
	}

	// Create the connection pool
	pgxPool, err := pgxpool.NewWithConfig(poolCtx, poolConfig)
	if err != nil {
		cancel()
		return nil, nil, fmt.Errorf("unable to create connection pool: %v", err)
	}

	return pgxPool, cancel, nil
}

func example() error {
	ctx := context.Background()

	// Establish connection pool
	pool, cancel, err := NewPool(ctx)
	if err != nil {
		return err
	}
	defer func() {
		pool.Close()
		cancel()
	}()

	// Ping the database to verify connection
	err = pool.Ping(ctx)
	if err != nil {
		return fmt.Errorf("unable to ping database: %v", err)
	}

	_, err = pool.Exec(ctx, `
                CREATE TABLE IF NOT EXISTS owner (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        name VARCHAR(255),
                        city VARCHAR(255),
                        telephone VARCHAR(255)
                )
        `)
	if err != nil {
		return fmt.Errorf("unable to create table: %v", err)
	}

	query := `INSERT INTO owner (id, name, city, telephone) VALUES ($1, $2, $3, $4)`
	_, err = pool.Exec(ctx, query, uuid.New(), "John Doe", "Anytown", "555-555-0150")
	if err != nil {
		return fmt.Errorf("unable to insert data: %v", err)
	}

	query = `SELECT id, name, city, telephone FROM owner where name='John Doe'`
	rows, err := pool.Query(ctx, query)
	if err != nil {
		return fmt.Errorf("unable to read data: %v", err)
	}
	defer rows.Close()

	owners, err := pgx.CollectRows(rows, pgx.RowToStructByName[Owner])
	if err != nil {
		return fmt.Errorf("error collecting rows: %w", err)
	}
	if len(owners) == 0 {
		return fmt.Errorf("no data found for John Doe")
	}
	if owners[0].Name != "John Doe" || owners[0].City != "Anytown" {
		return fmt.Errorf("unexpected data retrieved: got name=%s, city=%s, expected name=John Doe, city=Anytown",
			owners[0].Name, owners[0].City)
	}

	_, err = pool.Exec(ctx, `DELETE FROM owner where name='John Doe'`)
	if err != nil {
		return fmt.Errorf("unable to clean table: %v", err)
	}

	return nil
}

// Run example
func main() {
	err := example()
	if err != nil {
		log.Fatalf("Error: %v", err)
	}

	fmt.Println("Connection exercised successfully")
}
