package util

import (
	"context"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dsql"
	"log"
)

func UpdateCluster(ctx context.Context, region, id string, deleteProtection bool) (clusterStatus *dsql.UpdateClusterOutput, err error) {

	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		log.Fatalf("Failed to load AWS configuration: %v", err)
	}

	// Initialize the DSQL client
	client := dsql.NewFromConfig(cfg)

	input := dsql.UpdateClusterInput{
		Identifier:                &id,
		DeletionProtectionEnabled: &deleteProtection,
	}

	clusterStatus, err = client.UpdateCluster(context.Background(), &input)

	if err != nil {
		log.Fatalf("Failed to update cluster: %v", err)
	}

	log.Printf("Cluster updated successfully: %v", clusterStatus.Status)
	return clusterStatus, nil
}
