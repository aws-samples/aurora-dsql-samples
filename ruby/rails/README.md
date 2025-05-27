# Aurora DSQL with Ruby on Rails

This example demonstrates how to use an Aurora DSQL cluster with a Ruby On Rails
application. Aurora DSQL only supports token-based authentication so we extend the
[`pg-aws_rds_iam`][rds-plugin-repo] plugin to generate Aurora DSQL auth tokens
when required.

It also includes changes to ActiveRecord behavior to be compatible with Aurora DSQL
supported features.

[rds-plugin-repo]: https://github.com/haines/pg-aws_rds_iam

## Running this example
See [`petclinic/README.md`](./petclinic/README.md).

## Using Aurora DSQL authentication tokens with Rails
These are the changes to make to your Rails application to be compatible with Aurora DSQL.

### Add a token generator
To modify your Rails application to work with Aurora DSQL you should reproduce the
`DsqlAuthTokenGenerator` in [`adapter.rb`][file-adapter].

```ruby
require "aws-sdk-dsql"

class DsqlAuthTokenGenerator
  def call(host:, port:, user:)
    # e.g. host == "<clusterID>.dsql.us-east-1.on.aws"
    region = host.split(".")[2]
    raise "Unable to extract AWS region from host '#{host}'" unless region =~ /[\w\d-]+/

    token_generator = Aws::DSQL::AuthTokenGenerator.new(
      credentials: Aws::CredentialProviderChain.new.resolve,
    )

    auth_token_params = {
      endpoint: host,
      region: region,
      expires_in: 15 * 60 # 15 minutes, optional
    }

    case user
    when "admin"
      token_generator.generate_db_connect_admin_auth_token(auth_token_params)
    else
      token_generator.generate_db_connect_auth_token(auth_token_params)
    end
  end
end
```

`call` will be invoked when a new database connection is requested. It will:
1. Retrieve credentials for the running environment. The `Aws::CredentialProviderChain` discovers credentials
   in the order described in [these docs][docs-cred-provider].
1. Determine which token type to generate based on the database user.

The retrieved credentials will need permission to `dsql:DbConnectAdmin` for the `admin` user or
`dsql:DbConnect` for a custom user. See Aurora DSQL documentation for [IAM role connect][docs-dsql-iam]
and [authentication token generation][docs-generate-token] for more details.


Finally, register the adapter with the `pg-aws_rds_iam` plugin.
```ruby
PG::AWS_RDS_IAM.auth_token_generators.add :dsql do
  DsqlAuthTokenGenerator.new
end
```

[file-adapter]: ./petclinic/config/initializers/adapter.rb
[docs-cred-provider]: https://docs.aws.amazon.com/sdk-for-ruby/v3/developer-guide/credential-providers.html
[docs-dsql-iam]: https://docs.aws.amazon.com/aurora-dsql/latest/userguide/authentication-authorization.html#authentication-authorization-iam-role-connect
[docs-generate-token]: https://docs.aws.amazon.com/aurora-dsql/latest/userguide/SECTION_authentication-token.html

### Alter ActiveRecord behavior
Disable features not supported by Aurora DSQL. The example includes this in [`adapter.rb`][file-adapter].

```ruby
require "active_record/connection_adapters/postgresql/schema_statements"

module ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements
  # DSQL does not support setting min_messages in the connection parameters
  def client_min_messages=(level); end
end

require "active_record/connection_adapters/postgresql_adapter"

class ActiveRecord::ConnectionAdapters::PostgreSQLAdapter
  def set_standard_conforming_strings; end

  # Avoid error running multiple DDL or DDL + DML statements in the same transaction
  def supports_ddl_transactions?
    false
  end
end
```

### Use the adapter in the database configuration
Refer to [`database.yml`](./petclinic/config/database.yml).

```yml
development:
  <<: *default

  # Always the database name for Aurora DSQL
  database: postgres

  # eg: admin or other postgres users
  username: <postgres username>

  # Set this value based on the access of the configured user,
  # or omit if running as 'admin' and using the 'public' schema.
  schema_search_path: myschema

  # Set to Aurora DSQL instance endpoint
  # Use environment variables, etc for production values!
  # e.g. {clusterId}.dsql.{region}.on.aws
  host: foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws

  # Use the custom token generator we created
  aws_rds_iam_auth_token_generator: dsql

  # Provide the path to the root certificate. 
  # Amazon's root certs can be fetched from https://www.amazontrust.com/repository/
  sslrootcert: <replace with the path to root certificate>
  sslmode: verify-full

  # More DSQL compatibility tweaks
  advisory_locks: false
  prepared_statements: false
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
