package main

import (
	"context"
	"example/internal/util"
	"log"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"

	"github.com/aws/aws-sdk-go-v2/service/dsql"
)

func GetCluster(ctx context.Context, region, identifier string) (clusterStatus *dsql.GetClusterOutput, err error) {

	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		log.Fatalf("Failed to load AWS configuration: %v", err)
	}

	// Initialize the DSQL client
	client := dsql.NewFromConfig(cfg)

	input := &dsql.GetClusterInput{
		Identifier: aws.String(identifier),
	}
	clusterStatus, err = client.GetCluster(context.Background(), input)

	if err != nil {
		log.Fatalf("Failed to get cluster: %v", err)
	}

	log.Printf("Cluster ARN: %s", *clusterStatus.Arn)

	return clusterStatus, nil
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Minute)
	defer cancel()

	identifier := os.Getenv("CLUSTER_ID")
	if identifier == "" {
		log.Fatal("CLUSTER_ID environment variable is not set")
	}

	region := util.GetEnvWithDefault("CLUSTER_REGION", "us-east-1")

	_, err := GetCluster(ctx, region, identifier)
	if err != nil {
		log.Fatalf("Failed to get cluster: %v", err)
	}
}
