package main

import (
	"context"
	"fmt"
	_ "github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	_ "github.com/jackc/pgx/v5/stdlib"
	"hello_crud/utils"
	"log"
	"os"
	"strings"
)

type Owner struct {
	Id        string `json:"id"`
	Name      string `json:"name"`
	City      string `json:"city"`
	Telephone string `json:"telephone"`
}

const (
	ADMIN    = "admin"
	ENDPOINT = "abcdefghijklmnopq123456.c0001.us-east-1.prod.sql.axdb.aws.dev"
	SCHEMA   = "postgres"
	REGION   = "us-east-1"
)

func getConnectUrl(endpoint, schema string) string {
	var sb strings.Builder

	user := ADMIN
	sb.WriteString("postgres://")
	sb.WriteString(endpoint)
	sb.WriteString(":5432/")
	sb.WriteString(schema)
	sb.WriteString("?")
	sb.WriteString("user=")
	sb.WriteString(user)
	url := sb.String()
	return url
}

func getConnection(ctx context.Context, endpoint, region, schema string) (*pgx.Conn, error) {
	url := getConnectUrl(endpoint, schema)

	sess, err := session.NewSession()
	if err != nil {
		return nil, err
	}

	creds, err := sess.Config.Credentials.Get()
	if err != nil {
		return nil, err
	}
	staticCredentials := credentials.NewStaticCredentials(creds.AccessKeyID, creds.SecretAccessKey, creds.SessionToken)

	// The token expiration time is optional, and the default value 900 seconds
	token, err := utils.BuildAuthToken(endpoint, region, staticCredentials)

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

func createTables(ctx context.Context, db *pgx.Conn) error {
	_, err := db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS owner (
			id UUID PRIMARY KEY,
			name VARCHAR(255),
			city VARCHAR(255),
			telephone VARCHAR(255)
		)
	`)
	if err != nil {
		return err
	}
	return nil
}

func createOwner(ctx context.Context, conn *pgx.Conn) error {
	// Define the SQL query to insert a new owner record.
	query := `
       INSERT INTO owner (id, name, city, telephone) VALUES ($1, $2, $3, $4)
   `

	owner_id := uuid.New()

	_, err := conn.Exec(ctx, query, owner_id.String(), "John Doe", "Vancouver", "555 555-5555")

	if err != nil {
		log.Println("Error Inserting Owner")
		return err
	}
	return nil
}

func readOwner(ctx context.Context, conn *pgx.Conn) error {
	//var id string

	rowArray := Owner{}
	// Define the SQL query to insert a new owner record.
	query := `select id, name, city, telephone from owner`

	rows, err := conn.Query(ctx, query)
	defer rows.Close()

	for rows.Next() {
		err := rows.Scan(&rowArray.Id, &rowArray.Name, &rowArray.City, &rowArray.Telephone)
		if err != nil {
			log.Fatal(err)
		}
	}

	fmt.Println(rowArray)

	if err != nil {
		log.Println("Error retrieving Owner")
		return err
	}
	return nil
}

func updateOwner(ctx context.Context, db *pgx.Conn) error {
	// Define the SQL query to insert a new owner record.
	query := "UPDATE owner SET telephone = '555-5555-1234' WHERE name = 'John Doe'"

	_, err := db.Exec(ctx, query)

	if err != nil {
		log.Println("Error updating Owner")
		return err
	}
	return nil
}

func deleteOwner(ctx context.Context, conn *pgx.Conn) error {
	query := "DELETE FROM owner WHERE name = 'John Doe'"

	_, err := conn.Exec(ctx, query)

	if err != nil {
		log.Println("Error deleting Owner")
		return err
	}
	return nil
}

func main() {
	appCtx := context.Background()

	conn, err := getConnection(appCtx, ENDPOINT, REGION, SCHEMA)

	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(appCtx)

	err = createTables(appCtx, conn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}

	err = createOwner(appCtx, conn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to createOwner: %v\n", err)
		os.Exit(1)
	}

	err = readOwner(appCtx, conn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to readOwner: %v\n", err)
		os.Exit(1)
	}

	err = updateOwner(appCtx, conn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to updateOwner: %v\n", err)
		os.Exit(1)
	}

	err = deleteOwner(appCtx, conn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to deleteOwner: %v\n", err)
		os.Exit(1)
	}
}
