/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Package dsql provides a connector for Aurora DSQL using pgx with IAM authentication.
//
// The connector provides wrapper types around pgx that automatically handle
// IAM token generation for Aurora DSQL connections.
//
// Basic usage with a connection pool:
//
//	pool, err := dsql.NewPool(ctx, dsql.Config{
//	    Host: "cluster.dsql.us-east-1.on.aws",
//	})
//	if err != nil {
//	    log.Fatal(err)
//	}
//	defer pool.Close()
//
//	rows, err := pool.Query(ctx, "SELECT * FROM users")
//
// Using a connection string:
//
//	pool, err := dsql.NewPool(ctx, "postgres://admin@cluster.dsql.us-east-1.on.aws/postgres")
//
// For single connections:
//
//	conn, err := dsql.Connect(ctx, dsql.Config{
//	    Host:   "my-cluster-id",
//	    Region: "us-east-1",
//	})
//	if err != nil {
//	    log.Fatal(err)
//	}
//	defer conn.Close(ctx)
package dsql
