package main

import (
	"context"

	dsql "github.com/aws/aws-sdk-go-v2/service/dsql"
	"github.com/aws/aws-sdk-go-v2/service/dsql/types"
)

func CreateMultiRegionCluster(client *dsql.Client) (clustersStatus *dsql.CreateMultiRegionClustersOutput, err error) {

	deleteProtection := false
	witnessRegion := "us-west-2"

	usEast1Props := types.LinkedClusterProperties{
		DeletionProtectionEnabled: &deleteProtection,
		Tags: map[string]string{
			"Name":     "us-east-1-go-example-cluster",
			"Usercase": "testing-mr-use1",
		},
	}

	usEast2Props := types.LinkedClusterProperties{
		DeletionProtectionEnabled: &deleteProtection,
		Tags: map[string]string{
			"Name":     "us-east-2-go-example-cluster",
			"Usercase": "testing-mr-use2",
		},
	}

	clusterProperties := map[string]types.LinkedClusterProperties{
		"us-east-1": usEast1Props,
		"us-east-2": usEast2Props,
	}

	input := dsql.CreateMultiRegionClustersInput{
		LinkedRegionList:  []string{"us-east-1", "us-east-2"},
		WitnessRegion:     &witnessRegion,
		ClusterProperties: clusterProperties,
	}

	clustersStatus, err = client.CreateMultiRegionClusters(context.Background(), &input)
	return
}
