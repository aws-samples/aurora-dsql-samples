package main

import (
	"fmt"
	"os"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/dsql"
)

var client *dsql.Client
var region = "us-east-1"

func TestMain(m *testing.M) {

	awsDefaultRegion := os.Getenv("AWS_DEFAULT_REGION") // AWS CLI v1 environment region variable
	if awsDefaultRegion != "" {
		region = awsDefaultRegion
	}

	awsRegion := os.Getenv("AWS_REGION") // AWS CLI v2 environment region variable
	if awsRegion != "" {
		region = awsRegion
	}
	fmt.Println("Initializing the AWS client in region:" + region)
	clientUtil := ClientUtil{}

	awsClient, err := clientUtil.GetInstance(region)
	if err != nil {
		fmt.Println("failed to get the aws client:" + err.Error())
		os.Exit(1)
	}

	client = awsClient

	if client == nil {
		fmt.Println("aws client is not initialized")
		os.Exit(1)
	}

	m.Run()

	fmt.Println("All tests completed")

}

func TestSingleRegion(t *testing.T) {
	fmt.Println("Single Region Cluster Test: Starting")

	err := SingleRegionTest(client)
	if err != nil {
		t.Error("single region test failed:" + err.Error())
	}
	fmt.Println("Single Region Cluster Test: Completed")
}

func TestMultiRegion(t *testing.T) {
	fmt.Println("Multi Region Cluster Test: Starting")
	err := MultiRegionTest(client)
	if err != nil {
		t.Error("multi region test failed:" + err.Error())
	}
	fmt.Println("Multi Region Cluster Test: Completed")
}
