/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Package pgadapter provides a PostgreSQL wire protocol proxy for Aurora DSQL.
//
// The adapter listens for PostgreSQL connections from clients, handles IAM
// authentication transparently, and proxies traffic to Aurora DSQL. This allows
// standard PostgreSQL clients and tools (such as psql, pgAdmin, DBeaver, or
// language drivers) to connect to Aurora DSQL without modification.
//
// # Basic Usage
//
//	adapter, err := pgadapter.New(pgadapter.Config{
//	    DSQLEndpoint: "your-cluster.dsql.us-east-1.on.aws",
//	    ListenAddr:   "127.0.0.1:15432",
//	})
//	if err != nil {
//	    log.Fatal(err)
//	}
//
//	// Start serving in a goroutine or main loop
//	ctx, cancel := context.WithCancel(context.Background())
//	defer cancel()
//
//	if err := adapter.ListenAndServe(ctx); err != nil {
//	    log.Fatal(err)
//	}
//
// # How It Works
//
// When a client connects:
//
//  1. The adapter accepts the TCP connection and handles the PostgreSQL startup
//     handshake, including SSL negotiation (which is declined since local
//     connections typically don't need encryption).
//
//  2. The adapter extracts the username and database from the client's startup
//     message.
//
//  3. Using the configured AWS credentials, the adapter generates an IAM
//     authentication token for Aurora DSQL.
//
//  4. The adapter establishes a TLS connection to Aurora DSQL, authenticates
//     using the IAM token, and completes the backend connection.
//
//  5. The adapter sends authentication success messages to the client and
//     begins bidirectional proxying of all PostgreSQL protocol messages.
//
// # Authentication
//
// The adapter handles IAM authentication automatically. Clients connect with
// any password (or no password) since the actual authentication is performed
// using AWS credentials configured on the adapter.
//
// AWS credentials are resolved using the standard AWS SDK credential chain:
//   - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
//   - Shared credentials file (~/.aws/credentials)
//   - IAM role (for EC2, ECS, Lambda, etc.)
//   - Custom credentials provider (via Config.CustomCredentialsProvider)
//
// # Connection Pooling
//
// The adapter creates a new connection to Aurora DSQL for each client
// connection. For connection pooling, consider using a PostgreSQL connection
// pooler such as PgBouncer in front of the adapter, or use the dsql package
// directly with pgxpool for native connection pooling.
//
// # Limitations
//
//   - SSL/TLS is not supported on the client-facing side (clients connect in
//     plaintext to the local adapter). The connection to Aurora DSQL always
//     uses TLS.
//   - The adapter runs as a single process; for high availability, consider
//     running multiple instances behind a load balancer.
package pgadapter
