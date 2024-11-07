/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#pragma once

/* Generic header includes */
#include <aws/axdbfrontend/AxdbFrontendErrors.h>
#include <aws/core/client/GenericClientConfiguration.h>
#include <aws/core/client/AWSError.h>
#include <aws/core/utils/memory/stl/AWSString.h>
#include <aws/core/client/AsyncCallerContext.h>
#include <aws/core/http/HttpTypes.h>
#include <aws/axdbfrontend/AxdbFrontendEndpointProvider.h>
#include <future>
#include <functional>
/* End of generic header includes */

/* Service model headers required in AxdbFrontendClient header */
#include <aws/axdbfrontend/model/CreateClusterResult.h>
#include <aws/axdbfrontend/model/CreateMultiRegionClustersResult.h>
#include <aws/axdbfrontend/model/DeleteClusterResult.h>
#include <aws/axdbfrontend/model/GetClusterResult.h>
#include <aws/axdbfrontend/model/ListClustersResult.h>
#include <aws/axdbfrontend/model/ListTagsForResourceResult.h>
#include <aws/axdbfrontend/model/UpdateClusterResult.h>
#include <aws/axdbfrontend/model/ListClustersRequest.h>
#include <aws/axdbfrontend/model/CreateClusterRequest.h>
#include <aws/core/NoResult.h>
/* End of service model headers required in AxdbFrontendClient header */

namespace Aws
{
  namespace Http
  {
    class HttpClient;
    class HttpClientFactory;
  } // namespace Http

  namespace Utils
  {
    template< typename R, typename E> class Outcome;

    namespace Threading
    {
      class Executor;
    } // namespace Threading
  } // namespace Utils

  namespace Auth
  {
    class AWSCredentials;
    class AWSCredentialsProvider;
  } // namespace Auth

  namespace Client
  {
    class RetryStrategy;
  } // namespace Client

  namespace AxdbFrontend
  {
    using AxdbFrontendClientConfiguration = Aws::Client::GenericClientConfiguration;
    using AxdbFrontendEndpointProviderBase = Aws::AxdbFrontend::Endpoint::AxdbFrontendEndpointProviderBase;
    using AxdbFrontendEndpointProvider = Aws::AxdbFrontend::Endpoint::AxdbFrontendEndpointProvider;

    namespace Model
    {
      /* Service model forward declarations required in AxdbFrontendClient header */
      class CreateClusterRequest;
      class CreateMultiRegionClustersRequest;
      class DeleteClusterRequest;
      class DeleteMultiRegionClustersRequest;
      class GetClusterRequest;
      class ListClustersRequest;
      class ListTagsForResourceRequest;
      class TagResourceRequest;
      class UntagResourceRequest;
      class UpdateClusterRequest;
      /* End of service model forward declarations required in AxdbFrontendClient header */

      /* Service model Outcome class definitions */
      typedef Aws::Utils::Outcome<CreateClusterResult, AxdbFrontendError> CreateClusterOutcome;
      typedef Aws::Utils::Outcome<CreateMultiRegionClustersResult, AxdbFrontendError> CreateMultiRegionClustersOutcome;
      typedef Aws::Utils::Outcome<DeleteClusterResult, AxdbFrontendError> DeleteClusterOutcome;
      typedef Aws::Utils::Outcome<Aws::NoResult, AxdbFrontendError> DeleteMultiRegionClustersOutcome;
      typedef Aws::Utils::Outcome<GetClusterResult, AxdbFrontendError> GetClusterOutcome;
      typedef Aws::Utils::Outcome<ListClustersResult, AxdbFrontendError> ListClustersOutcome;
      typedef Aws::Utils::Outcome<ListTagsForResourceResult, AxdbFrontendError> ListTagsForResourceOutcome;
      typedef Aws::Utils::Outcome<Aws::NoResult, AxdbFrontendError> TagResourceOutcome;
      typedef Aws::Utils::Outcome<Aws::NoResult, AxdbFrontendError> UntagResourceOutcome;
      typedef Aws::Utils::Outcome<UpdateClusterResult, AxdbFrontendError> UpdateClusterOutcome;
      /* End of service model Outcome class definitions */

      /* Service model Outcome callable definitions */
      typedef std::future<CreateClusterOutcome> CreateClusterOutcomeCallable;
      typedef std::future<CreateMultiRegionClustersOutcome> CreateMultiRegionClustersOutcomeCallable;
      typedef std::future<DeleteClusterOutcome> DeleteClusterOutcomeCallable;
      typedef std::future<DeleteMultiRegionClustersOutcome> DeleteMultiRegionClustersOutcomeCallable;
      typedef std::future<GetClusterOutcome> GetClusterOutcomeCallable;
      typedef std::future<ListClustersOutcome> ListClustersOutcomeCallable;
      typedef std::future<ListTagsForResourceOutcome> ListTagsForResourceOutcomeCallable;
      typedef std::future<TagResourceOutcome> TagResourceOutcomeCallable;
      typedef std::future<UntagResourceOutcome> UntagResourceOutcomeCallable;
      typedef std::future<UpdateClusterOutcome> UpdateClusterOutcomeCallable;
      /* End of service model Outcome callable definitions */
    } // namespace Model

    class AxdbFrontendClient;

    /* Service model async handlers definitions */
    typedef std::function<void(const AxdbFrontendClient*, const Model::CreateClusterRequest&, const Model::CreateClusterOutcome&, const std::shared_ptr<const Aws::Client::AsyncCallerContext>&) > CreateClusterResponseReceivedHandler;
    typedef std::function<void(const AxdbFrontendClient*, const Model::CreateMultiRegionClustersRequest&, const Model::CreateMultiRegionClustersOutcome&, const std::shared_ptr<const Aws::Client::AsyncCallerContext>&) > CreateMultiRegionClustersResponseReceivedHandler;
    typedef std::function<void(const AxdbFrontendClient*, const Model::DeleteClusterRequest&, const Model::DeleteClusterOutcome&, const std::shared_ptr<const Aws::Client::AsyncCallerContext>&) > DeleteClusterResponseReceivedHandler;
    typedef std::function<void(const AxdbFrontendClient*, const Model::DeleteMultiRegionClustersRequest&, const Model::DeleteMultiRegionClustersOutcome&, const std::shared_ptr<const Aws::Client::AsyncCallerContext>&) > DeleteMultiRegionClustersResponseReceivedHandler;
    typedef std::function<void(const AxdbFrontendClient*, const Model::GetClusterRequest&, const Model::GetClusterOutcome&, const std::shared_ptr<const Aws::Client::AsyncCallerContext>&) > GetClusterResponseReceivedHandler;
    typedef std::function<void(const AxdbFrontendClient*, const Model::ListClustersRequest&, const Model::ListClustersOutcome&, const std::shared_ptr<const Aws::Client::AsyncCallerContext>&) > ListClustersResponseReceivedHandler;
    typedef std::function<void(const AxdbFrontendClient*, const Model::ListTagsForResourceRequest&, const Model::ListTagsForResourceOutcome&, const std::shared_ptr<const Aws::Client::AsyncCallerContext>&) > ListTagsForResourceResponseReceivedHandler;
    typedef std::function<void(const AxdbFrontendClient*, const Model::TagResourceRequest&, const Model::TagResourceOutcome&, const std::shared_ptr<const Aws::Client::AsyncCallerContext>&) > TagResourceResponseReceivedHandler;
    typedef std::function<void(const AxdbFrontendClient*, const Model::UntagResourceRequest&, const Model::UntagResourceOutcome&, const std::shared_ptr<const Aws::Client::AsyncCallerContext>&) > UntagResourceResponseReceivedHandler;
    typedef std::function<void(const AxdbFrontendClient*, const Model::UpdateClusterRequest&, const Model::UpdateClusterOutcome&, const std::shared_ptr<const Aws::Client::AsyncCallerContext>&) > UpdateClusterResponseReceivedHandler;
    /* End of service model async handlers definitions */
  } // namespace AxdbFrontend
} // namespace Aws
