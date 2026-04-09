// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

// Command lambda runs the Recipe Sharing API on AWS Lambda behind
// Amazon API Gateway. It wraps the Gin router with the aws-lambda-go-api-proxy
// adapter and connects to Amazon Aurora DSQL for the database.
package main

import (
	"context"
	"log"
	"os"

	"github.com/aws-samples/recipe-share-dsql-go/internal/router"
	"github.com/aws-samples/recipe-share-dsql-go/internal/store"
	"github.com/aws/aws-lambda-go/lambda"
	ginadapter "github.com/awslabs/aws-lambda-go-api-proxy/gin"
	"github.com/gin-gonic/gin"
)

func main() {
	// Set Gin to release mode for production to suppress debug output.
	gin.SetMode(gin.ReleaseMode)

	ctx := context.Background()

	// Read the Amazon Aurora DSQL endpoint from the environment.
	// This is set by the AWS CloudFormation template as a Lambda
	// environment variable.
	endpoint := os.Getenv("DSQL_ENDPOINT")
	if endpoint == "" {
		log.Fatal("DSQL_ENDPOINT environment variable is required")
	}

	// Create the Amazon Aurora DSQL store with IAM token-based authentication.
	dsqlStore, err := store.NewDSQLStore(ctx, endpoint)
	if err != nil {
		log.Fatalf("Failed to connect to Amazon Aurora DSQL: %v", err)
	}
	defer dsqlStore.Close()

	// Create the recipe_share schema and tables if they do not already exist.
	if err := dsqlStore.InitSchema(ctx); err != nil {
		log.Fatalf("Failed to initialize database schema: %v", err)
	}

	// Build the Gin router with the Amazon Aurora DSQL store.
	r := router.New(dsqlStore)

	// Wrap the Gin router with the Lambda adapter and start the handler.
	ginLambda := ginadapter.New(r)
	lambda.Start(ginLambda.ProxyWithContext)
}
