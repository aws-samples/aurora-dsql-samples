﻿/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#pragma once
#include <aws/axdbfrontend/AxdbFrontend_EXPORTS.h>
#include <aws/axdbfrontend/AxdbFrontendRequest.h>
#include <aws/core/utils/memory/stl/AWSVector.h>
#include <aws/core/utils/memory/stl/AWSMap.h>
#include <aws/core/utils/memory/stl/AWSString.h>
#include <aws/axdbfrontend/model/LinkedClusterProperties.h>
#include <utility>
#include <aws/core/utils/UUID.h>

namespace Aws
{
namespace AxdbFrontend
{
namespace Model
{

  /**
   */
  class CreateMultiRegionClustersRequest : public AxdbFrontendRequest
  {
  public:
    AWS_AXDBFRONTEND_API CreateMultiRegionClustersRequest();

    // Service request name is the Operation name which will send this request out,
    // each operation should has unique request name, so that we can get operation's name from this request.
    // Note: this is not true for response, multiple operations may have the same response name,
    // so we can not get operation's name from response.
    inline virtual const char* GetServiceRequestName() const override { return "CreateMultiRegionClusters"; }

    AWS_AXDBFRONTEND_API Aws::String SerializePayload() const override;


    ///@{
    
    inline const Aws::Vector<Aws::String>& GetLinkedRegionList() const{ return m_linkedRegionList; }
    inline bool LinkedRegionListHasBeenSet() const { return m_linkedRegionListHasBeenSet; }
    inline void SetLinkedRegionList(const Aws::Vector<Aws::String>& value) { m_linkedRegionListHasBeenSet = true; m_linkedRegionList = value; }
    inline void SetLinkedRegionList(Aws::Vector<Aws::String>&& value) { m_linkedRegionListHasBeenSet = true; m_linkedRegionList = std::move(value); }
    inline CreateMultiRegionClustersRequest& WithLinkedRegionList(const Aws::Vector<Aws::String>& value) { SetLinkedRegionList(value); return *this;}
    inline CreateMultiRegionClustersRequest& WithLinkedRegionList(Aws::Vector<Aws::String>&& value) { SetLinkedRegionList(std::move(value)); return *this;}
    inline CreateMultiRegionClustersRequest& AddLinkedRegionList(const Aws::String& value) { m_linkedRegionListHasBeenSet = true; m_linkedRegionList.push_back(value); return *this; }
    inline CreateMultiRegionClustersRequest& AddLinkedRegionList(Aws::String&& value) { m_linkedRegionListHasBeenSet = true; m_linkedRegionList.push_back(std::move(value)); return *this; }
    inline CreateMultiRegionClustersRequest& AddLinkedRegionList(const char* value) { m_linkedRegionListHasBeenSet = true; m_linkedRegionList.push_back(value); return *this; }
    ///@}

    ///@{
    
    inline const Aws::Map<Aws::String, LinkedClusterProperties>& GetClusterProperties() const{ return m_clusterProperties; }
    inline bool ClusterPropertiesHasBeenSet() const { return m_clusterPropertiesHasBeenSet; }
    inline void SetClusterProperties(const Aws::Map<Aws::String, LinkedClusterProperties>& value) { m_clusterPropertiesHasBeenSet = true; m_clusterProperties = value; }
    inline void SetClusterProperties(Aws::Map<Aws::String, LinkedClusterProperties>&& value) { m_clusterPropertiesHasBeenSet = true; m_clusterProperties = std::move(value); }
    inline CreateMultiRegionClustersRequest& WithClusterProperties(const Aws::Map<Aws::String, LinkedClusterProperties>& value) { SetClusterProperties(value); return *this;}
    inline CreateMultiRegionClustersRequest& WithClusterProperties(Aws::Map<Aws::String, LinkedClusterProperties>&& value) { SetClusterProperties(std::move(value)); return *this;}
    inline CreateMultiRegionClustersRequest& AddClusterProperties(const Aws::String& key, const LinkedClusterProperties& value) { m_clusterPropertiesHasBeenSet = true; m_clusterProperties.emplace(key, value); return *this; }
    inline CreateMultiRegionClustersRequest& AddClusterProperties(Aws::String&& key, const LinkedClusterProperties& value) { m_clusterPropertiesHasBeenSet = true; m_clusterProperties.emplace(std::move(key), value); return *this; }
    inline CreateMultiRegionClustersRequest& AddClusterProperties(const Aws::String& key, LinkedClusterProperties&& value) { m_clusterPropertiesHasBeenSet = true; m_clusterProperties.emplace(key, std::move(value)); return *this; }
    inline CreateMultiRegionClustersRequest& AddClusterProperties(Aws::String&& key, LinkedClusterProperties&& value) { m_clusterPropertiesHasBeenSet = true; m_clusterProperties.emplace(std::move(key), std::move(value)); return *this; }
    inline CreateMultiRegionClustersRequest& AddClusterProperties(const char* key, LinkedClusterProperties&& value) { m_clusterPropertiesHasBeenSet = true; m_clusterProperties.emplace(key, std::move(value)); return *this; }
    inline CreateMultiRegionClustersRequest& AddClusterProperties(const char* key, const LinkedClusterProperties& value) { m_clusterPropertiesHasBeenSet = true; m_clusterProperties.emplace(key, value); return *this; }
    ///@}

    ///@{
    
    inline const Aws::String& GetWitnessRegion() const{ return m_witnessRegion; }
    inline bool WitnessRegionHasBeenSet() const { return m_witnessRegionHasBeenSet; }
    inline void SetWitnessRegion(const Aws::String& value) { m_witnessRegionHasBeenSet = true; m_witnessRegion = value; }
    inline void SetWitnessRegion(Aws::String&& value) { m_witnessRegionHasBeenSet = true; m_witnessRegion = std::move(value); }
    inline void SetWitnessRegion(const char* value) { m_witnessRegionHasBeenSet = true; m_witnessRegion.assign(value); }
    inline CreateMultiRegionClustersRequest& WithWitnessRegion(const Aws::String& value) { SetWitnessRegion(value); return *this;}
    inline CreateMultiRegionClustersRequest& WithWitnessRegion(Aws::String&& value) { SetWitnessRegion(std::move(value)); return *this;}
    inline CreateMultiRegionClustersRequest& WithWitnessRegion(const char* value) { SetWitnessRegion(value); return *this;}
    ///@}

    ///@{
    
    inline const Aws::String& GetClientToken() const{ return m_clientToken; }
    inline bool ClientTokenHasBeenSet() const { return m_clientTokenHasBeenSet; }
    inline void SetClientToken(const Aws::String& value) { m_clientTokenHasBeenSet = true; m_clientToken = value; }
    inline void SetClientToken(Aws::String&& value) { m_clientTokenHasBeenSet = true; m_clientToken = std::move(value); }
    inline void SetClientToken(const char* value) { m_clientTokenHasBeenSet = true; m_clientToken.assign(value); }
    inline CreateMultiRegionClustersRequest& WithClientToken(const Aws::String& value) { SetClientToken(value); return *this;}
    inline CreateMultiRegionClustersRequest& WithClientToken(Aws::String&& value) { SetClientToken(std::move(value)); return *this;}
    inline CreateMultiRegionClustersRequest& WithClientToken(const char* value) { SetClientToken(value); return *this;}
    ///@}
  private:

    Aws::Vector<Aws::String> m_linkedRegionList;
    bool m_linkedRegionListHasBeenSet = false;

    Aws::Map<Aws::String, LinkedClusterProperties> m_clusterProperties;
    bool m_clusterPropertiesHasBeenSet = false;

    Aws::String m_witnessRegion;
    bool m_witnessRegionHasBeenSet = false;

    Aws::String m_clientToken;
    bool m_clientTokenHasBeenSet = false;
  };

} // namespace Model
} // namespace AxdbFrontend
} // namespace Aws
