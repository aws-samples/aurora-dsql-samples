/*
 * Copyright 2024 Amazon.com, Inc. or its affiliates.
 * Licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

using Amazon.Runtime;
using Amazon.Runtime.Internal;
using Amazon.Runtime.Internal.Auth;
using Amazon.Runtime.Internal.Util;

public static class TokenGenerator
{
    public static string GenerateDbConnectAdminAuthToken(string? hostname, Amazon.RegionEndpoint region, string? action)
    {
        AWSCredentials awsCredentials = FallbackCredentialsFactory.GetCredentials();

        string accessKey = awsCredentials.GetCredentials().AccessKey;
        string secretKey = awsCredentials.GetCredentials().SecretKey;
        string token = awsCredentials.GetCredentials().Token;

        const string DsqlServiceName = "dsql";
        const string HTTPGet = "GET";
        const string HTTPS = "https";
        const string URISchemeDelimiter = "://";
        const string ActionKey = "Action";

        action = action?.Trim();
        if (string.IsNullOrEmpty(action))
            throw new ArgumentException("Action must not be null or empty.");
        string ActionValue = action;
        const string XAmzSecurityToken = "X-Amz-Security-Token";

        ImmutableCredentials immutableCredentials = new ImmutableCredentials(accessKey, secretKey, token) ?? throw new ArgumentNullException("immutableCredentials");
        ArgumentNullException.ThrowIfNull(region);

        hostname = hostname?.Trim();
        if (string.IsNullOrEmpty(hostname))
            throw new ArgumentException("Hostname must not be null or empty.");

        GenerateDsqlAuthTokenRequest authTokenRequest = new GenerateDsqlAuthTokenRequest();
        IRequest request = new DefaultRequest(authTokenRequest, DsqlServiceName)
        {
            UseQueryString = true,
            HttpMethod = HTTPGet
        };
        request.Parameters.Add(ActionKey, ActionValue);
        request.Endpoint = new UriBuilder(HTTPS, hostname).Uri;

        if (immutableCredentials.UseToken)
        {
            request.Parameters[XAmzSecurityToken] = immutableCredentials.Token;
        }

        var signingResult = AWS4PreSignedUrlSigner.SignRequest(request, null, new RequestMetrics(), immutableCredentials.AccessKey,
            immutableCredentials.SecretKey, DsqlServiceName, region.SystemName);

        var authorization = "&" + signingResult.ForQueryParameters;
        var url = AmazonServiceClient.ComposeUrl(request);

        // remove the https:// and append the authorization
        return url.AbsoluteUri[(HTTPS.Length + URISchemeDelimiter.Length)..] + authorization;
    }

    private class GenerateDsqlAuthTokenRequest : AmazonWebServiceRequest
    {
        public GenerateDsqlAuthTokenRequest()
        {
            ((IAmazonWebServiceRequest)this).SignatureVersion = SignatureVersion.SigV4;
        }
    }
}
