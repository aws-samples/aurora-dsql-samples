package main

import (
	"context"

	dsql "github.com/aws/aws-sdk-go-v2/service/dsql"
)

func DeleteMultiRegionCluster(arnList []string, client *dsql.Client) (clusterStatus *dsql.DeleteMultiRegionClustersOutput, err error) {

	input := dsql.DeleteMultiRegionClustersInput{
		LinkedClusterArns: arnList,
	}

	clusterStatus, err = client.DeleteMultiRegionClusters(context.Background(), &input)
	return
}
