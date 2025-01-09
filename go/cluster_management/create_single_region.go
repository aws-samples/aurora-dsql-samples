package main

import (
	"context"

	dsql "github.com/aws/aws-sdk-go-v2/service/dsql"
)

func CreateCluster(client *dsql.Client, deleteProtection bool, tags map[string]string) (clusterStatus *dsql.CreateClusterOutput, err error) {

	input := dsql.CreateClusterInput{
		DeletionProtectionEnabled: &deleteProtection,
		Tags:                      tags,
	}

	clusterStatus, err = client.CreateCluster(context.Background(), &input)
	return
}
