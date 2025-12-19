# CLI and CloudShell examples for generating Aurora DSQL authentication tokens

# --8<-- [start:cloudshell-admin-token]
# Use `generate-db-connect-auth-token` if you are _not_ logging in as `admin` user
aws dsql generate-db-connect-admin-auth-token \
  --expires-in 3600 \
  --region us-east-1 \
  --hostname your_cluster_endpoint
# --8<-- [end:cloudshell-admin-token]

# --8<-- [start:cloudshell-psql-connection]
PGSSLMODE=require \
psql --dbname postgres \
  --username admin \
  --host cluster_endpoint
# --8<-- [end:cloudshell-psql-connection]

# --8<-- [start:cli-linux-macos]
# Use `generate-db-connect-auth-token` if you are _not_ logging in as `admin` user
aws dsql generate-db-connect-admin-auth-token \
  --region region \
  --expires-in 3600 \
  --hostname your_cluster_endpoint
# --8<-- [end:cli-linux-macos]

# --8<-- [start:cli-windows]
# Use `generate-db-connect-auth-token` if you are _not_ logging in as `admin` user
aws dsql generate-db-connect-admin-auth-token ^
  --region=region ^
  --expires-in=3600 ^
  --hostname=your_cluster_endpoint
# --8<-- [end:cli-windows]