
using Amazon.Runtime;
using Amazon.Runtime.Internal;
using Amazon.Runtime.Internal.Auth;
using Amazon.Runtime.Internal.Util;

namespace Example
{
    public static class TokenGenerator
    {
        public static string GenerateAuthToken(string? hostname, Amazon.RegionEndpoint region)
        {
            AWSCredentials awsCredentials = FallbackCredentialsFactory.GetCredentials();

            string accessKey = awsCredentials.GetCredentials().AccessKey;
            string secretKey = awsCredentials.GetCredentials().SecretKey;
            string token = awsCredentials.GetCredentials().Token;

            const string XanaduServiceName = "xanadu";
            const string HTTPGet = "GET";
            const string HTTPS = "https";
            const string URISchemeDelimiter = "://";
            const string ActionKey = "Action";
            const string ActionValue = "DbConnectSuperuser";
            const string XAmzExpires = "X-Amz-Expires";
            const string XAmzSecurityToken = "X-Amz-Security-Token";

            ImmutableCredentials immutableCredentials = new(accessKey, secretKey, token);
            if (immutableCredentials == null)
                throw new ArgumentNullException("immutableCredentials");

            if (region == null)
                throw new ArgumentNullException("region");

            hostname = hostname?.Trim();
            if (string.IsNullOrEmpty(hostname))
                throw new ArgumentException("Hostname must not be null or empty.");

            GenerateAxdbAuthTokenRequest authTokenRequest = new GenerateAxdbAuthTokenRequest();
            IRequest request = new DefaultRequest(authTokenRequest, XanaduServiceName);

            request.UseQueryString = true;
            request.HttpMethod = HTTPGet;
            request.Parameters.Add(XAmzExpires, "3600");
            request.Parameters.Add(ActionKey, ActionValue);
            request.Endpoint = new UriBuilder(HTTPS, hostname).Uri;

            if (immutableCredentials.UseToken)
            {
                request.Parameters[XAmzSecurityToken] = immutableCredentials.Token;
            }

            var signingResult = AWS4PreSignedUrlSigner.SignRequest(request, null, new RequestMetrics(), immutableCredentials.AccessKey,
                immutableCredentials.SecretKey, XanaduServiceName, region.SystemName);

            var authorization = "&" + signingResult.ForQueryParameters;
            var url = AmazonServiceClient.ComposeUrl(request);

            // remove the https:// and append the authorization
            return url.AbsoluteUri[(HTTPS.Length + URISchemeDelimiter.Length)..] + authorization;
        }

        private class GenerateAxdbAuthTokenRequest : AmazonWebServiceRequest
        {
            public GenerateAxdbAuthTokenRequest()
            {
                ((IAmazonWebServiceRequest)this).SignatureVersion = SignatureVersion.SigV4;
            }
        }
    }
}
