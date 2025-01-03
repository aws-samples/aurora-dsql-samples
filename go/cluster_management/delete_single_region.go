package main

import (
	"context"

	dsql "github.com/aws/aws-sdk-go-v2/service/dsql"
)

func DeleteCluster(id string, client *dsql.Client) (clusterStatus *dsql.DeleteClusterOutput, err error) {

	input := dsql.DeleteClusterInput{
		Identifier: &id,
	}

	clusterStatus, err = client.DeleteCluster(context.Background(), &input)
	return
}
