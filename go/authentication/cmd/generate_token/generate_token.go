// Go SDK examples for generating Aurora DSQL authentication tokens

package generate_token

// --8<-- [start:go-generate-token]
import (
	"context"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dsql/auth"
)

func GenerateDbConnectAdminAuthToken(ctx context.Context, clusterEndpoint, region string, expiry time.Duration) (string, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return "", err
	}

	tokenOptions := func(options *auth.TokenOptions) {
		options.ExpiresIn = expiry
	}

	// Use `auth.GenerateDbConnectAuthToken` if you are _not_ logging in as `admin` user
	token, err := auth.GenerateDBConnectAdminAuthToken(ctx, clusterEndpoint, region, cfg.Credentials, tokenOptions)
	if err != nil {
		return "", err
	}

	return token, nil
}
// --8<-- [end:go-generate-token]
