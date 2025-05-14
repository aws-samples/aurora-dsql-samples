package util

import (
	"context"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dsql"
	"github.com/aws/aws-sdk-go-v2/service/dsql/types"
	"testing"
)

// MockDSQLClient implements the necessary DSQL client methods for testing
type MockDSQLClient struct {
	listClusters *dsql.ListClustersOutput
	getCluster   *dsql.GetClusterOutput
	listErr      error
	getErr       error
}

func (m *MockDSQLClient) ListClusters(ctx context.Context, params *dsql.ListClustersInput) (*dsql.ListClustersOutput, error) {
	return m.listClusters, m.listErr
}

func (m *MockDSQLClient) GetCluster(ctx context.Context, params *dsql.GetClusterInput) (*dsql.GetClusterOutput, error) {
	return m.getCluster, m.getErr
}

func TestFindClusterByTag(t *testing.T) {
	tests := []struct {
		name     string
		region   string
		tagName  string
		tagValue string
		mockData struct {
			listClusters *dsql.ListClustersOutput
			getCluster   *dsql.GetClusterOutput
			listErr      error
			getErr       error
		}
		wantErr bool
	}{
		{
			name:     "Successfully find cluster",
			region:   "us-west-2",
			tagName:  "Environment",
			tagValue: "Production",
			mockData: struct {
				listClusters *dsql.ListClustersOutput
				getCluster   *dsql.GetClusterOutput
				listErr      error
				getErr       error
			}{
				listClusters: &dsql.ListClustersOutput{
					Clusters: []types.ClusterSummary{
						{
							Identifier: aws.String("cluster-1"),
						},
					},
				},
				getCluster: &dsql.GetClusterOutput{
					Identifier: aws.String("cluster-1"),
					Tags: map[string]string{
						"Environment": "Production",
					},
				},
			},
			wantErr: false,
		},
		{
			name:     "Empty tag name",
			region:   "us-west-2",
			tagName:  "",
			tagValue: "Production",
			mockData: struct {
				listClusters *dsql.ListClustersOutput
				getCluster   *dsql.GetClusterOutput
				listErr      error
				getErr       error
			}{},
			wantErr: true,
		},
		{
			name:     "Cluster not found",
			region:   "us-west-2",
			tagName:  "Environment",
			tagValue: "Staging",
			mockData: struct {
				listClusters *dsql.ListClustersOutput
				getCluster   *dsql.GetClusterOutput
				listErr      error
				getErr       error
			}{
				listClusters: &dsql.ListClustersOutput{
					Clusters: []types.ClusterSummary{
						{Identifier: aws.String("cluster-1")},
					},
				},
				getCluster: &dsql.GetClusterOutput{
					Identifier: aws.String("cluster-1"),
					Tags: map[string]string{
						"Environment": "Production",
					},
				},
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create mock client with test data
			//mockClient := &MockDSQLClient{
			//	listClusters: tt.mockData.listClusters,
			//	getCluster:   tt.mockData.getCluster,
			//	listErr:      tt.mockData.listErr,
			//	getErr:       tt.mockData.getErr,
			//}

			// Call the function being tested
			result, err := FindClusterByTag(context.Background(), "us-east-1", tt.tagName, tt.tagValue)

			// Check error cases
			if (err != nil) != tt.wantErr {
				t.Errorf("FindClusterByTag() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			// For successful cases, verify the result
			if !tt.wantErr && result != nil {
				if result.Tags[tt.tagName] != tt.tagValue {
					t.Errorf("FindClusterByTag() got tag value = %v, want %v",
						result.Tags[tt.tagName], tt.tagValue)
				}
			}
		})
	}
}
