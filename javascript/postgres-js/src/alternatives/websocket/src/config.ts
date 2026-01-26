/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// User Pool Settings
const region = "<COGNITO_REGION>";
const userPoolId = "<USER_POOL_ID>";
const clientId = "<USER_POOL_APP_CLIENT_ID>";
const cognitoDomain = "<COGNITO_DOMAIN>";
const redirectUri = "http://localhost:3000";

// Identity Pool Settings
const identityPoolId = "<COGNITO_IDENTITY_POOL_ID>";

// DSQL Cluster Settings
const dsqlHost = "your-cluster-endpoint.dsql.us-east-1.on.aws";
const dsqlUser = "example";

// Exported configurations
export const awsConfig = {
  region,
  userPoolId,
  identityPoolId,
  clientId,
  cognitoDomain,
  redirectUri,
};

export const cognitoAuthConfig = {
  authority: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: "email openid phone",
};

export const dsqlConfig = {
  host: dsqlHost,
  database: "postgres",
  user: dsqlUser,
  tokenDurationSecs: 60,
};
