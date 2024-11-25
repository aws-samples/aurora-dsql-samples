# WARNING ABOUT GENERATED CODE
#
# This file is generated. See the contributing guide for more information:
# https://github.com/aws/aws-sdk-ruby/blob/version-3/CONTRIBUTING.md
#
# WARNING ABOUT GENERATED CODE

Feature: Smoke tests for DSQL

  @dsql @smoke
  Scenario: GetClusterNotFound
    Given I create a 'Aws::DSQL' client with config:
      """
{"region":"us-east-1","use_fips_endpoint":false,"use_dualstack_endpoint":false}
      """
    When I call the operation 'get_cluster' with params:
      """
{"identifier":"someIdentifier"}
      """
    Then I expect a 'Aws::DSQL::Errors::ResourceNotFoundException' was raised

  @dsql @smoke
  Scenario: ListClustersSuccess
    Given I create a 'Aws::DSQL' client with config:
      """
{"region":"us-east-1","use_fips_endpoint":false,"use_dualstack_endpoint":false}
      """
    When I call the operation 'list_clusters' with params:
      """
{}
      """
    Then I expect an error was not raised
