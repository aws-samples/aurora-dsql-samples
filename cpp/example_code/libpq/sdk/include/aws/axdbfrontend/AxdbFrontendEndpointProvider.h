/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#pragma once
#include <aws/axdbfrontend/AxdbFrontend_EXPORTS.h>
#include <aws/core/client/GenericClientConfiguration.h>
#include <aws/core/endpoint/DefaultEndpointProvider.h>
#include <aws/core/endpoint/EndpointParameter.h>
#include <aws/core/utils/memory/stl/AWSString.h>
#include <aws/core/utils/memory/stl/AWSVector.h>

#include <aws/axdbfrontend/AxdbFrontendEndpointRules.h>


namespace Aws
{
namespace AxdbFrontend
{
namespace Endpoint
{
using EndpointParameters = Aws::Endpoint::EndpointParameters;
using Aws::Endpoint::EndpointProviderBase;
using Aws::Endpoint::DefaultEndpointProvider;

using AxdbFrontendClientContextParameters = Aws::Endpoint::ClientContextParameters;

using AxdbFrontendClientConfiguration = Aws::Client::GenericClientConfiguration;
using AxdbFrontendBuiltInParameters = Aws::Endpoint::BuiltInParameters;

/**
 * The type for the AxdbFrontend Client Endpoint Provider.
 * Inherit from this Base class / "Interface" should you want to provide a custom endpoint provider.
 * The SDK must use service-specific type for each service per specification.
 */
using AxdbFrontendEndpointProviderBase =
    EndpointProviderBase<AxdbFrontendClientConfiguration, AxdbFrontendBuiltInParameters, AxdbFrontendClientContextParameters>;

using AxdbFrontendDefaultEpProviderBase =
    DefaultEndpointProvider<AxdbFrontendClientConfiguration, AxdbFrontendBuiltInParameters, AxdbFrontendClientContextParameters>;

/**
 * Default endpoint provider used for this service
 */
class AWS_AXDBFRONTEND_API AxdbFrontendEndpointProvider : public AxdbFrontendDefaultEpProviderBase
{
public:
    using AxdbFrontendResolveEndpointOutcome = Aws::Endpoint::ResolveEndpointOutcome;

    AxdbFrontendEndpointProvider()
      : AxdbFrontendDefaultEpProviderBase(Aws::AxdbFrontend::AxdbFrontendEndpointRules::GetRulesBlob(), Aws::AxdbFrontend::AxdbFrontendEndpointRules::RulesBlobSize)
    {}

    ~AxdbFrontendEndpointProvider()
    {
    }
};
} // namespace Endpoint
} // namespace AxdbFrontend
} // namespace Aws
