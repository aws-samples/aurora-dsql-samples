/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#pragma once
#include <aws/axdbfrontend/AxdbFrontend_EXPORTS.h>
#include <aws/core/client/ClientConfiguration.h>
#include <aws/core/client/AWSClient.h>
#include <aws/core/client/AWSClientAsyncCRTP.h>
#include <aws/core/utils/json/JsonSerializer.h>
#include <aws/axdbfrontend/AxdbFrontendServiceClientModel.h>

namespace Aws
{
namespace AxdbFrontend
{
  /**
   * <p>Xanadu</p>
   */
  class AWS_AXDBFRONTEND_API AxdbFrontendClient : public Aws::Client::AWSJsonClient, public Aws::Client::ClientWithAsyncTemplateMethods<AxdbFrontendClient>
  {
    public:
      typedef Aws::Client::AWSJsonClient BASECLASS;
      static const char* GetServiceName();
      static const char* GetAllocationTag();

      typedef AxdbFrontendClientConfiguration ClientConfigurationType;
      typedef AxdbFrontendEndpointProvider EndpointProviderType;

       /**
        * Initializes client to use DefaultCredentialProviderChain, with default http client factory, and optional client config. If client config
        * is not specified, it will be initialized to default values.
        */
        AxdbFrontendClient(const Aws::AxdbFrontend::AxdbFrontendClientConfiguration& clientConfiguration = Aws::AxdbFrontend::AxdbFrontendClientConfiguration(),
                           std::shared_ptr<AxdbFrontendEndpointProviderBase> endpointProvider = nullptr);

       /**
        * Initializes client to use SimpleAWSCredentialsProvider, with default http client factory, and optional client config. If client config
        * is not specified, it will be initialized to default values.
        */
        AxdbFrontendClient(const Aws::Auth::AWSCredentials& credentials,
                           std::shared_ptr<AxdbFrontendEndpointProviderBase> endpointProvider = nullptr,
                           const Aws::AxdbFrontend::AxdbFrontendClientConfiguration& clientConfiguration = Aws::AxdbFrontend::AxdbFrontendClientConfiguration());

       /**
        * Initializes client to use specified credentials provider with specified client config. If http client factory is not supplied,
        * the default http client factory will be used
        */
        AxdbFrontendClient(const std::shared_ptr<Aws::Auth::AWSCredentialsProvider>& credentialsProvider,
                           std::shared_ptr<AxdbFrontendEndpointProviderBase> endpointProvider = nullptr,
                           const Aws::AxdbFrontend::AxdbFrontendClientConfiguration& clientConfiguration = Aws::AxdbFrontend::AxdbFrontendClientConfiguration());


        /* Legacy constructors due deprecation */
       /**
        * Initializes client to use DefaultCredentialProviderChain, with default http client factory, and optional client config. If client config
        * is not specified, it will be initialized to default values.
        */
        AxdbFrontendClient(const Aws::Client::ClientConfiguration& clientConfiguration);

       /**
        * Initializes client to use SimpleAWSCredentialsProvider, with default http client factory, and optional client config. If client config
        * is not specified, it will be initialized to default values.
        */
        AxdbFrontendClient(const Aws::Auth::AWSCredentials& credentials,
                           const Aws::Client::ClientConfiguration& clientConfiguration);

       /**
        * Initializes client to use specified credentials provider with specified client config. If http client factory is not supplied,
        * the default http client factory will be used
        */
        AxdbFrontendClient(const std::shared_ptr<Aws::Auth::AWSCredentialsProvider>& credentialsProvider,
                           const Aws::Client::ClientConfiguration& clientConfiguration);

        /* End of legacy constructors due deprecation */
        virtual ~AxdbFrontendClient();

        /**
         * <p>Create a cluster</p><p><h3>See Also:</h3>   <a
         * href="http://docs.aws.amazon.com/goto/WebAPI/axdbfrontend-2018-05-10/CreateCluster">AWS
         * API Reference</a></p>
         */
        virtual Model::CreateClusterOutcome CreateCluster(const Model::CreateClusterRequest& request = {}) const;

        /**
         * A Callable wrapper for CreateCluster that returns a future to the operation so that it can be executed in parallel to other requests.
         */
        template<typename CreateClusterRequestT = Model::CreateClusterRequest>
        Model::CreateClusterOutcomeCallable CreateClusterCallable(const CreateClusterRequestT& request = {}) const
        {
            return SubmitCallable(&AxdbFrontendClient::CreateCluster, request);
        }

        /**
         * An Async wrapper for CreateCluster that queues the request into a thread executor and triggers associated callback when operation has finished.
         */
        template<typename CreateClusterRequestT = Model::CreateClusterRequest>
        void CreateClusterAsync(const CreateClusterResponseReceivedHandler& handler, const std::shared_ptr<const Aws::Client::AsyncCallerContext>& context = nullptr, const CreateClusterRequestT& request = {}) const
        {
            return SubmitAsync(&AxdbFrontendClient::CreateCluster, request, handler, context);
        }

        /**
         * <p>Create clusters in multiple regions</p><p><h3>See Also:</h3>   <a
         * href="http://docs.aws.amazon.com/goto/WebAPI/axdbfrontend-2018-05-10/CreateMultiRegionClusters">AWS
         * API Reference</a></p>
         */
        virtual Model::CreateMultiRegionClustersOutcome CreateMultiRegionClusters(const Model::CreateMultiRegionClustersRequest& request) const;

        /**
         * A Callable wrapper for CreateMultiRegionClusters that returns a future to the operation so that it can be executed in parallel to other requests.
         */
        template<typename CreateMultiRegionClustersRequestT = Model::CreateMultiRegionClustersRequest>
        Model::CreateMultiRegionClustersOutcomeCallable CreateMultiRegionClustersCallable(const CreateMultiRegionClustersRequestT& request) const
        {
            return SubmitCallable(&AxdbFrontendClient::CreateMultiRegionClusters, request);
        }

        /**
         * An Async wrapper for CreateMultiRegionClusters that queues the request into a thread executor and triggers associated callback when operation has finished.
         */
        template<typename CreateMultiRegionClustersRequestT = Model::CreateMultiRegionClustersRequest>
        void CreateMultiRegionClustersAsync(const CreateMultiRegionClustersRequestT& request, const CreateMultiRegionClustersResponseReceivedHandler& handler, const std::shared_ptr<const Aws::Client::AsyncCallerContext>& context = nullptr) const
        {
            return SubmitAsync(&AxdbFrontendClient::CreateMultiRegionClusters, request, handler, context);
        }

        /**
         * <p>Delete a cluster</p><p><h3>See Also:</h3>   <a
         * href="http://docs.aws.amazon.com/goto/WebAPI/axdbfrontend-2018-05-10/DeleteCluster">AWS
         * API Reference</a></p>
         */
        virtual Model::DeleteClusterOutcome DeleteCluster(const Model::DeleteClusterRequest& request) const;

        /**
         * A Callable wrapper for DeleteCluster that returns a future to the operation so that it can be executed in parallel to other requests.
         */
        template<typename DeleteClusterRequestT = Model::DeleteClusterRequest>
        Model::DeleteClusterOutcomeCallable DeleteClusterCallable(const DeleteClusterRequestT& request) const
        {
            return SubmitCallable(&AxdbFrontendClient::DeleteCluster, request);
        }

        /**
         * An Async wrapper for DeleteCluster that queues the request into a thread executor and triggers associated callback when operation has finished.
         */
        template<typename DeleteClusterRequestT = Model::DeleteClusterRequest>
        void DeleteClusterAsync(const DeleteClusterRequestT& request, const DeleteClusterResponseReceivedHandler& handler, const std::shared_ptr<const Aws::Client::AsyncCallerContext>& context = nullptr) const
        {
            return SubmitAsync(&AxdbFrontendClient::DeleteCluster, request, handler, context);
        }

        /**
         * <p>Delete clusters in multiple regions</p><p><h3>See Also:</h3>   <a
         * href="http://docs.aws.amazon.com/goto/WebAPI/axdbfrontend-2018-05-10/DeleteMultiRegionClusters">AWS
         * API Reference</a></p>
         */
        virtual Model::DeleteMultiRegionClustersOutcome DeleteMultiRegionClusters(const Model::DeleteMultiRegionClustersRequest& request) const;

        /**
         * A Callable wrapper for DeleteMultiRegionClusters that returns a future to the operation so that it can be executed in parallel to other requests.
         */
        template<typename DeleteMultiRegionClustersRequestT = Model::DeleteMultiRegionClustersRequest>
        Model::DeleteMultiRegionClustersOutcomeCallable DeleteMultiRegionClustersCallable(const DeleteMultiRegionClustersRequestT& request) const
        {
            return SubmitCallable(&AxdbFrontendClient::DeleteMultiRegionClusters, request);
        }

        /**
         * An Async wrapper for DeleteMultiRegionClusters that queues the request into a thread executor and triggers associated callback when operation has finished.
         */
        template<typename DeleteMultiRegionClustersRequestT = Model::DeleteMultiRegionClustersRequest>
        void DeleteMultiRegionClustersAsync(const DeleteMultiRegionClustersRequestT& request, const DeleteMultiRegionClustersResponseReceivedHandler& handler, const std::shared_ptr<const Aws::Client::AsyncCallerContext>& context = nullptr) const
        {
            return SubmitAsync(&AxdbFrontendClient::DeleteMultiRegionClusters, request, handler, context);
        }

        /**
         * <p>Get a cluster</p><p><h3>See Also:</h3>   <a
         * href="http://docs.aws.amazon.com/goto/WebAPI/axdbfrontend-2018-05-10/GetCluster">AWS
         * API Reference</a></p>
         */
        virtual Model::GetClusterOutcome GetCluster(const Model::GetClusterRequest& request) const;

        /**
         * A Callable wrapper for GetCluster that returns a future to the operation so that it can be executed in parallel to other requests.
         */
        template<typename GetClusterRequestT = Model::GetClusterRequest>
        Model::GetClusterOutcomeCallable GetClusterCallable(const GetClusterRequestT& request) const
        {
            return SubmitCallable(&AxdbFrontendClient::GetCluster, request);
        }

        /**
         * An Async wrapper for GetCluster that queues the request into a thread executor and triggers associated callback when operation has finished.
         */
        template<typename GetClusterRequestT = Model::GetClusterRequest>
        void GetClusterAsync(const GetClusterRequestT& request, const GetClusterResponseReceivedHandler& handler, const std::shared_ptr<const Aws::Client::AsyncCallerContext>& context = nullptr) const
        {
            return SubmitAsync(&AxdbFrontendClient::GetCluster, request, handler, context);
        }

        /**
         * <p>List clusters</p><p><h3>See Also:</h3>   <a
         * href="http://docs.aws.amazon.com/goto/WebAPI/axdbfrontend-2018-05-10/ListClusters">AWS
         * API Reference</a></p>
         */
        virtual Model::ListClustersOutcome ListClusters(const Model::ListClustersRequest& request = {}) const;

        /**
         * A Callable wrapper for ListClusters that returns a future to the operation so that it can be executed in parallel to other requests.
         */
        template<typename ListClustersRequestT = Model::ListClustersRequest>
        Model::ListClustersOutcomeCallable ListClustersCallable(const ListClustersRequestT& request = {}) const
        {
            return SubmitCallable(&AxdbFrontendClient::ListClusters, request);
        }

        /**
         * An Async wrapper for ListClusters that queues the request into a thread executor and triggers associated callback when operation has finished.
         */
        template<typename ListClustersRequestT = Model::ListClustersRequest>
        void ListClustersAsync(const ListClustersResponseReceivedHandler& handler, const std::shared_ptr<const Aws::Client::AsyncCallerContext>& context = nullptr, const ListClustersRequestT& request = {}) const
        {
            return SubmitAsync(&AxdbFrontendClient::ListClusters, request, handler, context);
        }

        /**
         * <p>List all Tags on an ARN</p><p><h3>See Also:</h3>   <a
         * href="http://docs.aws.amazon.com/goto/WebAPI/axdbfrontend-2018-05-10/ListTagsForResource">AWS
         * API Reference</a></p>
         */
        virtual Model::ListTagsForResourceOutcome ListTagsForResource(const Model::ListTagsForResourceRequest& request) const;

        /**
         * A Callable wrapper for ListTagsForResource that returns a future to the operation so that it can be executed in parallel to other requests.
         */
        template<typename ListTagsForResourceRequestT = Model::ListTagsForResourceRequest>
        Model::ListTagsForResourceOutcomeCallable ListTagsForResourceCallable(const ListTagsForResourceRequestT& request) const
        {
            return SubmitCallable(&AxdbFrontendClient::ListTagsForResource, request);
        }

        /**
         * An Async wrapper for ListTagsForResource that queues the request into a thread executor and triggers associated callback when operation has finished.
         */
        template<typename ListTagsForResourceRequestT = Model::ListTagsForResourceRequest>
        void ListTagsForResourceAsync(const ListTagsForResourceRequestT& request, const ListTagsForResourceResponseReceivedHandler& handler, const std::shared_ptr<const Aws::Client::AsyncCallerContext>& context = nullptr) const
        {
            return SubmitAsync(&AxdbFrontendClient::ListTagsForResource, request, handler, context);
        }

        /**
         * <p>Add Tags to an ARN</p><p><h3>See Also:</h3>   <a
         * href="http://docs.aws.amazon.com/goto/WebAPI/axdbfrontend-2018-05-10/TagResource">AWS
         * API Reference</a></p>
         */
        virtual Model::TagResourceOutcome TagResource(const Model::TagResourceRequest& request) const;

        /**
         * A Callable wrapper for TagResource that returns a future to the operation so that it can be executed in parallel to other requests.
         */
        template<typename TagResourceRequestT = Model::TagResourceRequest>
        Model::TagResourceOutcomeCallable TagResourceCallable(const TagResourceRequestT& request) const
        {
            return SubmitCallable(&AxdbFrontendClient::TagResource, request);
        }

        /**
         * An Async wrapper for TagResource that queues the request into a thread executor and triggers associated callback when operation has finished.
         */
        template<typename TagResourceRequestT = Model::TagResourceRequest>
        void TagResourceAsync(const TagResourceRequestT& request, const TagResourceResponseReceivedHandler& handler, const std::shared_ptr<const Aws::Client::AsyncCallerContext>& context = nullptr) const
        {
            return SubmitAsync(&AxdbFrontendClient::TagResource, request, handler, context);
        }

        /**
         * <p>Remove Tags from an ARN</p><p><h3>See Also:</h3>   <a
         * href="http://docs.aws.amazon.com/goto/WebAPI/axdbfrontend-2018-05-10/UntagResource">AWS
         * API Reference</a></p>
         */
        virtual Model::UntagResourceOutcome UntagResource(const Model::UntagResourceRequest& request) const;

        /**
         * A Callable wrapper for UntagResource that returns a future to the operation so that it can be executed in parallel to other requests.
         */
        template<typename UntagResourceRequestT = Model::UntagResourceRequest>
        Model::UntagResourceOutcomeCallable UntagResourceCallable(const UntagResourceRequestT& request) const
        {
            return SubmitCallable(&AxdbFrontendClient::UntagResource, request);
        }

        /**
         * An Async wrapper for UntagResource that queues the request into a thread executor and triggers associated callback when operation has finished.
         */
        template<typename UntagResourceRequestT = Model::UntagResourceRequest>
        void UntagResourceAsync(const UntagResourceRequestT& request, const UntagResourceResponseReceivedHandler& handler, const std::shared_ptr<const Aws::Client::AsyncCallerContext>& context = nullptr) const
        {
            return SubmitAsync(&AxdbFrontendClient::UntagResource, request, handler, context);
        }

        /**
         * <p>Update a cluster</p><p><h3>See Also:</h3>   <a
         * href="http://docs.aws.amazon.com/goto/WebAPI/axdbfrontend-2018-05-10/UpdateCluster">AWS
         * API Reference</a></p>
         */
        virtual Model::UpdateClusterOutcome UpdateCluster(const Model::UpdateClusterRequest& request) const;

        /**
         * A Callable wrapper for UpdateCluster that returns a future to the operation so that it can be executed in parallel to other requests.
         */
        template<typename UpdateClusterRequestT = Model::UpdateClusterRequest>
        Model::UpdateClusterOutcomeCallable UpdateClusterCallable(const UpdateClusterRequestT& request) const
        {
            return SubmitCallable(&AxdbFrontendClient::UpdateCluster, request);
        }

        /**
         * An Async wrapper for UpdateCluster that queues the request into a thread executor and triggers associated callback when operation has finished.
         */
        template<typename UpdateClusterRequestT = Model::UpdateClusterRequest>
        void UpdateClusterAsync(const UpdateClusterRequestT& request, const UpdateClusterResponseReceivedHandler& handler, const std::shared_ptr<const Aws::Client::AsyncCallerContext>& context = nullptr) const
        {
            return SubmitAsync(&AxdbFrontendClient::UpdateCluster, request, handler, context);
        }

        Aws::Utils::Outcome<String, AxdbFrontendError> GenerateDBAuthToken(const Aws::String& hostname, const Aws::String& region, const Aws::String& action, long long expiresIn = 900);

      void OverrideEndpoint(const Aws::String& endpoint);
      std::shared_ptr<AxdbFrontendEndpointProviderBase>& accessEndpointProvider();
    private:
      friend class Aws::Client::ClientWithAsyncTemplateMethods<AxdbFrontendClient>;
      void init(const AxdbFrontendClientConfiguration& clientConfiguration);

      AxdbFrontendClientConfiguration m_clientConfiguration;
      std::shared_ptr<AxdbFrontendEndpointProviderBase> m_endpointProvider;
  };

} // namespace AxdbFrontend
} // namespace Aws
