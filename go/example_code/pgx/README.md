# Go with Aurora DSQL

## Table of Contents

1. Prerequisites
2. Obtaining the pgx driver for Go
3. Example using go with pgx to interact with Aurora DSQL

## Prerequisites

1. Provision a Aurora DSQL cluster by following the [user guide](TBD) if not already done.
   Note down the endpoint, you will need to establish a connection.
2. Go: Ensure you have Go installed. You can download it from the [official website](https://go.dev/dl/)

   _To verify the is installed, you can run_

   ```bash
   go version
   ```

   It should output something similar to `go version go1.23.2 darwin/arm64`. (your version could be different)

- AWS SDK: Ensure that you setup the latest version of the AWS Go SDK [official website](https://github.com/aws/aws-sdk-go-v2)

For example for pgx:

### Obtaining the pgx driver for Go

#### Direct Download

The PostgreSQL Go Driver can be installed via go get

Example

```bash
go get github.com/jackc/pgx/v5
```

### Example using go with pgx to interact with Aurora DSQL

```go
package main

import (
	"context"
	"fmt"
	_ "github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/aws/signer/v4"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	_ "github.com/jackc/pgx/v5/stdlib"
	"net/http"
	"os"
	"strings"
	"time"
)

// Define a structure to represent our table.
// Please follow on to see how we will unpack a result into this structure.
type Owner struct {
	Id        string `json:"id"`
	Name      string `json:"name"`
	City      string `json:"city"`
	Telephone string `json:"telephone"`
}

const (
	// Please replace with your own cluster endpoint
	ENDPOINT = "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
	REGION   = "us-east-1"
)

// Generate the password token needed to establish a connection
func generateAuthToken(creds *credentials.Credentials, action string) (string, error) {
	// the scheme is arbitrary and is only needed because validation of the URL requires one.
	endpoint := "https://" + ENDPOINT
	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return "", err
	}
	values := req.URL.Query()
	values.Set("Action", action)
	req.URL.RawQuery = values.Encode()

	signer := v4.Signer{
		Credentials: creds,
	}
	_, err = signer.Presign(req, nil, "dsql", REGION, 15*time.Minute, time.Now())
	if err != nil {
		return "", err
	}

	url := req.URL.String()[len("https://"):]

	return url, nil
}

// Create a connection to Aurora DSQL
func getConnection(ctx context.Context) (*pgx.Conn, error) {
	// Build connection URL
	var sb strings.Builder
	sb.WriteString("postgres://")
	sb.WriteString(ENDPOINT)
	sb.WriteString(":5432/postgres?user=admin&sslmode=verify-full")
	url := sb.String()

	sess, err := session.NewSession()
	if err != nil {
		return nil, err
	}

	creds, err := sess.Config.Credentials.Get()
	if err != nil {
		return nil, err
	}
	staticCredentials := credentials.NewStaticCredentials(
		creds.AccessKeyID,
		creds.SecretAccessKey,
		creds.SessionToken,
	)

	// The token expiration time is optional, and the default value 900 seconds
	// If you are not connecting as admin, use DbConnect action instead
	token, err := generateAuthToken(staticCredentials, "DbConnectAdmin")
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

// Illustrates how to interact with Aurora DSQL
func example() error {
	ctx := context.Background()

	// Establish connection
	conn, err := getConnection(ctx)
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

	// Insert data
	query := `INSERT INTO owner (id, name, city, telephone) VALUES ($1, $2, $3, $4)`
	_, err = conn.Exec(ctx, query, uuid.New(), "John Doe", "Anytown", "555-555-1999")

	if err != nil {
		return err
	}

	owners := []Owner{}

	// Read the inserted data back
	query = `SELECT id, name, city, telephone FROM owner where name='John Doe'`
	
	rows, err := conn.Query(ctx, query)
	defer rows.Close()
	
	owners, err = pgx.CollectRows(rows, pgx.RowToStructByName[Owner])
	fmt.Println(owners)
	if err != nil || owners[0].Name != "John Doe" || owners[0].City != "Anytown" {
		panic("Error retrieving data")
	}

	defer conn.Close(ctx)

	return nil
}

// Run example
func main() {
	err := example()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to run example: %v\n", err)
		os.Exit(1)
	}
}
```
