package main

import (
	"errors"
	"fmt"
	"time"

	dsql "github.com/aws/aws-sdk-go-v2/service/dsql"
	"github.com/aws/aws-sdk-go-v2/service/dsql/types"
)

func SingleRegionTest(client *dsql.Client) (err error) {

	deleteProtectionEnabled := true

	createdClusterStatus, err := CreateCluster(client, deleteProtectionEnabled, map[string]string{"Name": "ExampleClusterGo"})
	if err != nil {
		return err
	}

	clusterId := createdClusterStatus.Identifier

	if clusterId == nil || (clusterId != nil && len(*clusterId) == 0) {
		return errors.New("the cluster identifier is missing after creating a single cluster")
	}

	time.Sleep(60 * time.Second) // Just an approximate arbitrarily chosen time

	getClusterStatus, err := GetCluster(*clusterId, client)
	if err != nil {
		return err
	}

	if getClusterStatus.Status == types.ClusterStatusFailed {
		return errors.New("the cluster failed")
	}

	deleteProtectionEnabled = false
	updateClusteStatus, err := UpdateCluster(*clusterId, deleteProtectionEnabled, client)
	if err != nil {
		return err
	}

	if updateClusteStatus.Status != types.ClusterStatusUpdating {
		return errors.New("updateCluster failed")
	}

	time.Sleep(5 * time.Second) // Just an approximate arbitrarily chosen time

	fmt.Println("Deleting Cluster")
	deleteClusterStatus, err := DeleteCluster(*clusterId, client)
	if err != nil {
		return err
	}

	if deleteClusterStatus.Status != types.ClusterStatusDeleting {
		return errors.New("deleteCluster failed")
	}

	return err
}

func MultiRegionTest(client *dsql.Client) (err error) {

	multiRegionClusterStatus, err := CreateMultiRegionCluster(client)
	if err != nil {
		return err
	}

	time.Sleep(60 * time.Second) // Just an approximate arbitrarily chosen time

	_, err = DeleteMultiRegionCluster(multiRegionClusterStatus.LinkedClusterArns, client)
	if err != nil {
		return err
	}

	fmt.Println("Deleted Cluster ARNs: ")
	for _, arn := range multiRegionClusterStatus.LinkedClusterArns {
		fmt.Println(arn)
	}

	return err
}
