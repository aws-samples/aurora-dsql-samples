package utils

import (
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/signer/v4"
	"net/http"
	"strings"
	"time"
)

// BuildAuthToken will return an authorization token used as the password for a DB
// connection.
//
// * endpoint - Endpoint consists of the port needed to connect to the DB. <host>:<port>
// * region - Region is the location of where the DB is
// * creds - Credentials to be signed with
//
// The following example shows how to use BuildAuthToken to create an authentication
// token for connecting to a Aurora Distributed SQL database in RDS.
//
//	authToken, err := BuildAuthToken(dbEndpoint, awsRegion, dbUser, awsCreds)
func BuildAuthToken(endpoint, region string, creds *credentials.Credentials) (string, error) {
	// the scheme is arbitrary and is only needed because validation of the URL requires one.
	if !(strings.HasPrefix(endpoint, "http://") || strings.HasPrefix(endpoint, "https://")) {
		endpoint = "https://" + endpoint
	}

	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return "", err
	}
	values := req.URL.Query()
	values.Set("Action", "DbConnectSuperuser")
	req.URL.RawQuery = values.Encode()

	signer := v4.Signer{
		Credentials: creds,
	}
	_, err = signer.Presign(req, nil, "xanadu", region, 15*time.Minute, time.Now())
	if err != nil {
		return "", err
	}

	url := req.URL.String()
	if strings.HasPrefix(url, "http://") {
		url = url[len("http://"):]
	} else if strings.HasPrefix(url, "https://") {
		url = url[len("https://"):]
	}

	return url, nil
}
