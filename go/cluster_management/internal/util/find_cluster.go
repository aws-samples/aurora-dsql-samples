package util

import (
	"context"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dsql"
	"log"
	"os"
)

func GetEnvWithDefault(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

func GetUniqueRunTagName(tagPrefix string) string {
	uniqueId := GetEnvWithDefault("GITHUB_RUN_ID", "1")
	return tagPrefix + " - " + uniqueId
}

// FindClusterWithTagAndRepository finds an Aurora cluster by a specific tag name and value.
func FindClusterWithTagAndRepository(ctx context.Context, region, tagName, tagValue string) (*dsql.GetClusterOutput, error) {
	if tagName == "" || tagValue == "" {
		return nil, fmt.Errorf("tagName and tagValue cannot be empty")
	}

	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		log.Fatalf("Failed to load AWS configuration: %v", err)
	}

	// Initialize the DSQL client
	client := dsql.NewFromConfig(cfg)

	clustersOutput, err := client.ListClusters(ctx, &dsql.ListClustersInput{})

	if err != nil {
		log.Fatalf("Failed to list clusters: %v", err)
	}

	for _, val := range clustersOutput.Clusters {
		clusterOutput, err := client.GetCluster(ctx, &dsql.GetClusterInput{Identifier: val.Identifier})
		if err != nil {
			log.Fatalf("Failed to get cluster: %v", err)
		}

		if clusterOutput.Tags[tagName] == tagValue && clusterOutput.Tags["Repo"] == os.Getenv("GITHUB_REPOSITORY") &&
			(clusterOutput.Status == "ACTIVE" || clusterOutput.Status == "PENDING_SETUP") {
			fmt.Println("found cluster:" + *val.Identifier + " with tag:" + tagName + "=" + tagValue)
			return clusterOutput, nil
		}
	}

	return nil, fmt.Errorf("no cluster found with tag %s=%s", tagName, tagValue)
}
