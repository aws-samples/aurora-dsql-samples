# Go with Aurora DSQL

## Table of Contents

1. Prerequisites
2. Obtaining the pgx driver for Go
3. Connect to cluster
4. Execute Examples
   1. SQL CRUD Examples
      1. Create
      2. Read
      3. Update
      4. Delete

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

### Connect to Cluster

Via Go

```go
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
```

## SQL CRUD Examples

> [!Important]
>
> To execute the example code, you need to have valid AWS Credentials configured (e.g. AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN)

## Owner Type

```
...
type Owner struct {
	Id        string `json:"id"`
	Name      string `json:"name"`
	City      string `json:"city"`
	Telephone string `json:"telephone"`
}
```

### 1. Create Owner Table

> **Note**
>
> Note that Aurora DSQL does not support SERIAL, so id is based on uuid (suggest best practice guide on this TBD: Update link)

```go
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
```

### 2. Create Owner

```go
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
```

### 3. Read Owner

```go
func readOwner(ctx context.Context, conn *pgx.Conn) error {
	//var id string

	rowArray := Owner{}
	// Define the SQL query to read the new owner record.
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
```

### 4. Update Owner

```go
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
```

### 5. Delete Owner

```go
func deleteOwner(ctx context.Context, conn *pgx.Conn) error {
	query := "DELETE FROM owner WHERE name = 'John Doe'"

	_, err := conn.Exec(ctx, query)

	if err != nil {
		log.Println("Error deleting Owner")
		return err
	}
	return nil
}
```
