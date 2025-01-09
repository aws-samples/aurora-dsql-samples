package main

import (
	"context"

	dsql "github.com/aws/aws-sdk-go-v2/service/dsql"
)

func GetCluster(id string, client *dsql.Client) (clusterStatus *dsql.GetClusterOutput, err error) {

	input := dsql.GetClusterInput{
		Identifier: &id,
	}
	clusterStatus, err = client.GetCluster(context.Background(), &input)
	return
}

func ListClusterTags(arn string, client *dsql.Client) (tags *dsql.ListTagsForResourceOutput, err error) {
	input := dsql.ListTagsForResourceInput{
		ResourceArn: &arn,
	}
	tags, err = client.ListTagsForResource(context.Background(), &input)
	return
}
