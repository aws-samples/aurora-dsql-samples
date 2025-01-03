package main

import (
	"context"

	dsql "github.com/aws/aws-sdk-go-v2/service/dsql"
)

func UpdateCluster(id string, deleteProtection bool, client *dsql.Client) (clusterStatus *dsql.UpdateClusterOutput, err error) {

	input := dsql.UpdateClusterInput{
		Identifier:                &id,
		DeletionProtectionEnabled: &deleteProtection,
	}

	clusterStatus, err = client.UpdateCluster(context.Background(), &input)
	return
}
