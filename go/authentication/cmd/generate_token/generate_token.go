// Go SDK examples for generating Aurora DSQL authentication tokens

// --8<-- [start:go-generate-token]
func GenerateDbConnectAdminAuthToken(yourClusterEndpoint string, region string, action string) (string, error) {
	// Fetch credentials
	sess, err := session.NewSession()
	if err != nil {
		return "", err
	}

	creds, err := sess.Config.Credentials.Get()
	if err != nil {
		return "", err
	}
	staticCredentials := credentials.NewStaticCredentials(
		creds.AccessKeyID,
		creds.SecretAccessKey,
		creds.SessionToken,
	)

	// The scheme is arbitrary and is only needed because validation of the URL requires one.
	endpoint := "https://" + yourClusterEndpoint
	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return "", err
	}
	values := req.URL.Query()
	values.Set("Action", action)
	req.URL.RawQuery = values.Encode()

	signer := v4.Signer{
		Credentials: staticCredentials,
	}
	_, err = signer.Presign(req, nil, "dsql", region, 15*time.Minute, time.Now())
	if err != nil {
		return "", err
	}

	url := req.URL.String()[len("https://"):]

	return url, nil
}
// --8<-- [end:go-generate-token]