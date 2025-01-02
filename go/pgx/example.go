package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	_ "github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	_ "github.com/jackc/pgx/v5/stdlib"
)

type Owner struct {
	Id        string `json:"id"`
	Name      string `json:"name"`
	City      string `json:"city"`
	Telephone string `json:"telephone"`
}

func GenerateDbConnectAdminAuthToken(clusterEndpoint string, region string, action string) (string, error) {

	ctx := context.Background()
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return "", err
	}

	creds, err := cfg.Credentials.Retrieve(ctx)
	if err != nil {
		return "", err
	}

	// The scheme is arbitrary and is only needed because validation of the URL requires one.
	endpoint := "https://" + clusterEndpoint
	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return "", err
	}
	values := req.URL.Query()
	values.Set("Action", action)

	// Set an expiry time for 15 minutes
	values.Set("X-Amz-Expires", strconv.Itoa(15*60))
	req.URL.RawQuery = values.Encode()

	signer := v4.NewSigner()

	// The payloadHash is the hex encoded SHA-256 hash of the request payload, and
	// must be provided. Even if the request has no payload (aka body). If the
	// request has no payload you should use the hex encoded SHA-256 of an empty
	// string as the payloadHash value.
	// e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855

	uri, _, err := signer.PresignHTTP(ctx, creds, req, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "dsql", region, time.Now())
	if err != nil {
		panic(err)
	}

	token := uri[len("https://"):]
	return token, nil
}

func getConnection(ctx context.Context, clusterEndpoint string, region string) (*pgx.Conn, error) {
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

	connConfig, err := pgx.ParseConfig(url)
	// To avoid issues with parse config set the password directly in config
	connConfig.Password = token
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to parse config: %v\n", err)
		os.Exit(1)
	}

	conn, err := pgx.ConnectConfig(ctx, connConfig)

	return conn, err
}

func example(clusterEndpoint string, region string) error {
	ctx := context.Background()

	// Establish connection
	conn, err := getConnection(ctx, clusterEndpoint, region)
	if err != nil {
		return err
	}

	// Create owner table
	_, err = conn.Exec(ctx, `
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
	_, err = conn.Exec(ctx, query, uuid.New(), "John Doe", "Anytown", "555-555-0150")

	if err != nil {
		return err
	}

	owners := []Owner{}
	// Define the SQL query to insert a new owner record.
	query = `SELECT id, name, city, telephone FROM owner where name='John Doe'`

	rows, err := conn.Query(ctx, query)
	defer rows.Close()

	owners, err = pgx.CollectRows(rows, pgx.RowToStructByName[Owner])
	fmt.Println(owners)
	if err != nil || owners[0].Name != "John Doe" || owners[0].City != "Anytown" {
		panic("Error retrieving data")
	}

	_, err = conn.Exec(ctx, `DELETE FROM owner where name='John Doe'`)
	if err != nil {
		return err
	}

	defer conn.Close(ctx)

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
