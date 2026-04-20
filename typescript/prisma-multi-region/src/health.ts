// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { MultiRegionDsqlClient } from "./dsql-client";

export async function healthCheck(dsql: MultiRegionDsqlClient) {
  const regionInfo = dsql.getRegionInfo();
  let dbStatus = "disconnected";

  try {
    const client = await dsql.getClient();
    await client.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch {
    dbStatus = "disconnected";
  }

  return {
    status: dbStatus === "connected" ? "healthy" : "degraded",
    region: regionInfo.localRegion,
    database: dbStatus,
    endpoints: {
      primary: regionInfo.primaryEndpoint,
      secondary: regionInfo.secondaryEndpoint,
    },
    timestamp: new Date().toISOString(),
  };
}
