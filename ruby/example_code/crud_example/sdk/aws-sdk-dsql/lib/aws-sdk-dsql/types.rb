# frozen_string_literal: true

# WARNING ABOUT GENERATED CODE
#
# This file is generated. See the contributing guide for more information:
# https://github.com/aws/aws-sdk-ruby/blob/version-3/CONTRIBUTING.md
#
# WARNING ABOUT GENERATED CODE

module Aws::DSQL
  module Types

    # User does not have sufficient access to perform this action
    #
    # @!attribute [rw] message
    #   @return [String]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/AccessDeniedException AWS API Documentation
    #
    class AccessDeniedException < Struct.new(
      :message)
      SENSITIVE = []
      include Aws::Structure
    end

    # Cluster Summary
    #
    # @!attribute [rw] identifier
    #   Cluster ID
    #   @return [String]
    #
    # @!attribute [rw] arn
    #   Cluster ARN
    #   @return [String]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/ClusterSummary AWS API Documentation
    #
    class ClusterSummary < Struct.new(
      :identifier,
      :arn)
      SENSITIVE = []
      include Aws::Structure
    end

    # Updating or deleting a resource can cause an inconsistent state
    #
    # @!attribute [rw] message
    #   Description of the error
    #   @return [String]
    #
    # @!attribute [rw] resource_id
    #   Identifier of the resource affected
    #   @return [String]
    #
    # @!attribute [rw] resource_type
    #   Type of the resource affected
    #   @return [String]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/ConflictException AWS API Documentation
    #
    class ConflictException < Struct.new(
      :message,
      :resource_id,
      :resource_type)
      SENSITIVE = []
      include Aws::Structure
    end

    # @!attribute [rw] deletion_protection_enabled
    #   Deletion Protection
    #   @return [Boolean]
    #
    # @!attribute [rw] tags
    #   Map of tags
    #   @return [Hash<String,String>]
    #
    # @!attribute [rw] client_token
    #   Idempotency Token
    #
    #   **A suitable default value is auto-generated.** You should normally
    #   not need to pass this option.
    #   @return [String]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/CreateClusterInput AWS API Documentation
    #
    class CreateClusterInput < Struct.new(
      :deletion_protection_enabled,
      :tags,
      :client_token)
      SENSITIVE = []
      include Aws::Structure
    end

    # Output Mixin
    #
    # @!attribute [rw] identifier
    #   Cluster ID
    #   @return [String]
    #
    # @!attribute [rw] arn
    #   Cluster ARN
    #   @return [String]
    #
    # @!attribute [rw] status
    #   Cluster Status
    #   @return [String]
    #
    # @!attribute [rw] creation_time
    #   Timestamp when the Cluster was created
    #   @return [Time]
    #
    # @!attribute [rw] deletion_protection_enabled
    #   Deletion Protection
    #   @return [Boolean]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/CreateClusterOutput AWS API Documentation
    #
    class CreateClusterOutput < Struct.new(
      :identifier,
      :arn,
      :status,
      :creation_time,
      :deletion_protection_enabled)
      SENSITIVE = []
      include Aws::Structure
    end

    # @!attribute [rw] linked_region_list
    #   List of regions
    #   @return [Array<String>]
    #
    # @!attribute [rw] cluster_properties
    #   Properties for each linked cluster
    #   @return [Hash<String,Types::LinkedClusterProperties>]
    #
    # @!attribute [rw] witness_region
    #   AWS Region name (e.g.: 'us-east-1')
    #   @return [String]
    #
    # @!attribute [rw] client_token
    #   Idempotency Token
    #
    #   **A suitable default value is auto-generated.** You should normally
    #   not need to pass this option.
    #   @return [String]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/CreateMultiRegionClustersInput AWS API Documentation
    #
    class CreateMultiRegionClustersInput < Struct.new(
      :linked_region_list,
      :cluster_properties,
      :witness_region,
      :client_token)
      SENSITIVE = []
      include Aws::Structure
    end

    # @!attribute [rw] linked_cluster_arns
    #   List of cluster arns
    #   @return [Array<String>]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/CreateMultiRegionClustersOutput AWS API Documentation
    #
    class CreateMultiRegionClustersOutput < Struct.new(
      :linked_cluster_arns)
      SENSITIVE = []
      include Aws::Structure
    end

    # @!attribute [rw] identifier
    #   Cluster ID
    #   @return [String]
    #
    # @!attribute [rw] client_token
    #   Idempotency Token
    #
    #   **A suitable default value is auto-generated.** You should normally
    #   not need to pass this option.
    #   @return [String]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/DeleteClusterInput AWS API Documentation
    #
    class DeleteClusterInput < Struct.new(
      :identifier,
      :client_token)
      SENSITIVE = []
      include Aws::Structure
    end

    # Output Mixin
    #
    # @!attribute [rw] identifier
    #   Cluster ID
    #   @return [String]
    #
    # @!attribute [rw] arn
    #   Cluster ARN
    #   @return [String]
    #
    # @!attribute [rw] status
    #   Cluster Status
    #   @return [String]
    #
    # @!attribute [rw] creation_time
    #   Timestamp when the Cluster was created
    #   @return [Time]
    #
    # @!attribute [rw] deletion_protection_enabled
    #   Deletion Protection
    #   @return [Boolean]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/DeleteClusterOutput AWS API Documentation
    #
    class DeleteClusterOutput < Struct.new(
      :identifier,
      :arn,
      :status,
      :creation_time,
      :deletion_protection_enabled)
      SENSITIVE = []
      include Aws::Structure
    end

    # @!attribute [rw] linked_cluster_arns
    #   List of cluster arns
    #   @return [Array<String>]
    #
    # @!attribute [rw] client_token
    #   Idempotency Token
    #
    #   **A suitable default value is auto-generated.** You should normally
    #   not need to pass this option.
    #   @return [String]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/DeleteMultiRegionClustersInput AWS API Documentation
    #
    class DeleteMultiRegionClustersInput < Struct.new(
      :linked_cluster_arns,
      :client_token)
      SENSITIVE = []
      include Aws::Structure
    end

    # @!attribute [rw] identifier
    #   Cluster ID
    #   @return [String]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/GetClusterInput AWS API Documentation
    #
    class GetClusterInput < Struct.new(
      :identifier)
      SENSITIVE = []
      include Aws::Structure
    end

    # Output Mixin
    #
    # @!attribute [rw] identifier
    #   Cluster ID
    #   @return [String]
    #
    # @!attribute [rw] arn
    #   Cluster ARN
    #   @return [String]
    #
    # @!attribute [rw] status
    #   Cluster Status
    #   @return [String]
    #
    # @!attribute [rw] creation_time
    #   Timestamp when the Cluster was created
    #   @return [Time]
    #
    # @!attribute [rw] deletion_protection_enabled
    #   Deletion Protection
    #   @return [Boolean]
    #
    # @!attribute [rw] witness_region
    #   AWS Region name (e.g.: 'us-east-1')
    #   @return [String]
    #
    # @!attribute [rw] linked_cluster_arns
    #   List of cluster arns
    #   @return [Array<String>]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/GetClusterOutput AWS API Documentation
    #
    class GetClusterOutput < Struct.new(
      :identifier,
      :arn,
      :status,
      :creation_time,
      :deletion_protection_enabled,
      :witness_region,
      :linked_cluster_arns)
      SENSITIVE = []
      include Aws::Structure
    end

    # Unexpected error during processing of request
    #
    # @!attribute [rw] message
    #   Description of the error
    #   @return [String]
    #
    # @!attribute [rw] retry_after_seconds
    #   Advice to clients on when the call can be safely retried
    #   @return [Integer]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/InternalServerException AWS API Documentation
    #
    class InternalServerException < Struct.new(
      :message,
      :retry_after_seconds)
      SENSITIVE = []
      include Aws::Structure
    end

    # Linked Cluster Properties
    #
    # @!attribute [rw] deletion_protection_enabled
    #   Deletion Protection
    #   @return [Boolean]
    #
    # @!attribute [rw] tags
    #   Map of tags
    #   @return [Hash<String,String>]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/LinkedClusterProperties AWS API Documentation
    #
    class LinkedClusterProperties < Struct.new(
      :deletion_protection_enabled,
      :tags)
      SENSITIVE = []
      include Aws::Structure
    end

    # @!attribute [rw] max_results
    #   Max results that will be returned per page
    #   @return [Integer]
    #
    # @!attribute [rw] next_token
    #   Opaque token used to retrieve next page
    #   @return [String]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/ListClustersInput AWS API Documentation
    #
    class ListClustersInput < Struct.new(
      :max_results,
      :next_token)
      SENSITIVE = []
      include Aws::Structure
    end

    # @!attribute [rw] next_token
    #   Opaque token used to retrieve next page
    #   @return [String]
    #
    # @!attribute [rw] clusters
    #   List of clusters
    #   @return [Array<Types::ClusterSummary>]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/ListClustersOutput AWS API Documentation
    #
    class ListClustersOutput < Struct.new(
      :next_token,
      :clusters)
      SENSITIVE = []
      include Aws::Structure
    end

    # @!attribute [rw] resource_arn
    #   Amazon Resource Name
    #   @return [String]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/ListTagsForResourceInput AWS API Documentation
    #
    class ListTagsForResourceInput < Struct.new(
      :resource_arn)
      SENSITIVE = []
      include Aws::Structure
    end

    # @!attribute [rw] tags
    #   Map of tags
    #   @return [Hash<String,String>]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/ListTagsForResourceOutput AWS API Documentation
    #
    class ListTagsForResourceOutput < Struct.new(
      :tags)
      SENSITIVE = []
      include Aws::Structure
    end

    # Request references a resource which does not exist
    #
    # @!attribute [rw] message
    #   @return [String]
    #
    # @!attribute [rw] resource_id
    #   Hypothetical identifier of the resource which does not exist
    #   @return [String]
    #
    # @!attribute [rw] resource_type
    #   Hypothetical type of the resource which does not exist
    #   @return [String]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/ResourceNotFoundException AWS API Documentation
    #
    class ResourceNotFoundException < Struct.new(
      :message,
      :resource_id,
      :resource_type)
      SENSITIVE = []
      include Aws::Structure
    end

    # Request would cause a service quota to be exceeded
    #
    # @!attribute [rw] message
    #   Description of the error
    #   @return [String]
    #
    # @!attribute [rw] resource_id
    #   Identifier of the resource affected
    #   @return [String]
    #
    # @!attribute [rw] resource_type
    #   Type of the resource affected
    #   @return [String]
    #
    # @!attribute [rw] service_code
    #   Service Quotas requirement to identify originating service
    #   @return [String]
    #
    # @!attribute [rw] quota_code
    #   Service Quotas requirement to identify originating quota
    #   @return [String]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/ServiceQuotaExceededException AWS API Documentation
    #
    class ServiceQuotaExceededException < Struct.new(
      :message,
      :resource_id,
      :resource_type,
      :service_code,
      :quota_code)
      SENSITIVE = []
      include Aws::Structure
    end

    # @!attribute [rw] resource_arn
    #   Amazon Resource Name
    #   @return [String]
    #
    # @!attribute [rw] tags
    #   Map of tags
    #   @return [Hash<String,String>]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/TagResourceInput AWS API Documentation
    #
    class TagResourceInput < Struct.new(
      :resource_arn,
      :tags)
      SENSITIVE = []
      include Aws::Structure
    end

    # Request was denied due to request throttling
    #
    # @!attribute [rw] message
    #   Description of the error
    #   @return [String]
    #
    # @!attribute [rw] service_code
    #   Service Quotas requirement to identify originating service
    #   @return [String]
    #
    # @!attribute [rw] quota_code
    #   Service Quotas requirement to identify originating quota
    #   @return [String]
    #
    # @!attribute [rw] retry_after_seconds
    #   Advice to clients on when the call can be safely retried
    #   @return [Integer]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/ThrottlingException AWS API Documentation
    #
    class ThrottlingException < Struct.new(
      :message,
      :service_code,
      :quota_code,
      :retry_after_seconds)
      SENSITIVE = []
      include Aws::Structure
    end

    # @!attribute [rw] resource_arn
    #   Amazon Resource Name
    #   @return [String]
    #
    # @!attribute [rw] tag_keys
    #   List of tag keys
    #   @return [Array<String>]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/UntagResourceInput AWS API Documentation
    #
    class UntagResourceInput < Struct.new(
      :resource_arn,
      :tag_keys)
      SENSITIVE = []
      include Aws::Structure
    end

    # @!attribute [rw] identifier
    #   Cluster ID
    #   @return [String]
    #
    # @!attribute [rw] deletion_protection_enabled
    #   Deletion Protection
    #   @return [Boolean]
    #
    # @!attribute [rw] client_token
    #   Idempotency Token
    #
    #   **A suitable default value is auto-generated.** You should normally
    #   not need to pass this option.
    #   @return [String]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/UpdateClusterInput AWS API Documentation
    #
    class UpdateClusterInput < Struct.new(
      :identifier,
      :deletion_protection_enabled,
      :client_token)
      SENSITIVE = []
      include Aws::Structure
    end

    # Output Mixin
    #
    # @!attribute [rw] identifier
    #   Cluster ID
    #   @return [String]
    #
    # @!attribute [rw] arn
    #   Cluster ARN
    #   @return [String]
    #
    # @!attribute [rw] status
    #   Cluster Status
    #   @return [String]
    #
    # @!attribute [rw] creation_time
    #   Timestamp when the Cluster was created
    #   @return [Time]
    #
    # @!attribute [rw] deletion_protection_enabled
    #   Deletion Protection
    #   @return [Boolean]
    #
    # @!attribute [rw] witness_region
    #   AWS Region name (e.g.: 'us-east-1')
    #   @return [String]
    #
    # @!attribute [rw] linked_cluster_arns
    #   List of cluster arns
    #   @return [Array<String>]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/UpdateClusterOutput AWS API Documentation
    #
    class UpdateClusterOutput < Struct.new(
      :identifier,
      :arn,
      :status,
      :creation_time,
      :deletion_protection_enabled,
      :witness_region,
      :linked_cluster_arns)
      SENSITIVE = []
      include Aws::Structure
    end

    # The input fails to satisfy the constraints specified by an AWS service
    #
    # @!attribute [rw] message
    #   @return [String]
    #
    # @!attribute [rw] reason
    #   Reason the request failed validation
    #   @return [String]
    #
    # @!attribute [rw] field_list
    #   List of fields that caused the error
    #   @return [Array<Types::ValidationExceptionField>]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/ValidationException AWS API Documentation
    #
    class ValidationException < Struct.new(
      :message,
      :reason,
      :field_list)
      SENSITIVE = []
      include Aws::Structure
    end

    # A field that caused the error
    #
    # @!attribute [rw] name
    #   The field name
    #   @return [String]
    #
    # @!attribute [rw] message
    #   Message describing why the field failed validation
    #   @return [String]
    #
    # @see http://docs.aws.amazon.com/goto/WebAPI/dsql-2018-05-10/ValidationExceptionField AWS API Documentation
    #
    class ValidationExceptionField < Struct.new(
      :name,
      :message)
      SENSITIVE = []
      include Aws::Structure
    end

  end
end

