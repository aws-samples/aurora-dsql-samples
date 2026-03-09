# Aurora DSQL with Ruby on Rails

This example demonstrates how to use an Aurora DSQL cluster with a Ruby On Rails
application. It uses the [`aurora-dsql-ruby-pg`][connector-gem] connector to
automatically generate authentication tokens for new database connections.

It also includes changes to ActiveRecord behavior to be compatible with Aurora DSQL
supported features.

[connector-gem]: https://rubygems.org/gems/aurora-dsql-ruby-pg

## Running this example
See [`petclinic/README.md`](./petclinic/README.md).

## Using Aurora DSQL authentication tokens with Rails
These are the changes to make to your Rails application to be compatible with Aurora DSQL.

### Add the connector gem
Add `aurora-dsql-ruby-pg` to your `Gemfile`:

```ruby
gem "pg", "~> 1.5"
gem "aurora-dsql-ruby-pg", "~> 1.0", require: "aurora_dsql_pg"
```

### Inject DSQL tokens into new connections
Create an initializer (e.g. [`config/initializers/adapter.rb`][file-adapter]) that
hooks into the PostgreSQL adapter to generate tokens for each new connection:

```ruby
require "aurora_dsql_pg"
require "active_record/connection_adapters/postgresql_adapter"

module DsqlTokenAuthentication
  def new_client(conn_params)
    host = conn_params[:host]
    if host&.include?(".dsql.")
      region = AuroraDsql::Pg::Util.parse_region(host)
      conn_params[:password] = AuroraDsql::Pg::Token.generate(
        host: host,
        region: region,
        user: conn_params[:user] || "admin"
      )
    end
    super
  end
end

# new_client is a class method in Rails 7.2, so prepend on the singleton class
ActiveRecord::ConnectionAdapters::PostgreSQLAdapter.singleton_class.prepend(DsqlTokenAuthentication)
```

`new_client` is called when a new database connection is requested. It will:
1. Retrieve credentials for the running environment via the default AWS credential provider chain
   ([docs][docs-cred-provider]).
2. Determine which token type to generate based on the database user.

The retrieved credentials will need permission to `dsql:DbConnectAdmin` for the `admin` user or
`dsql:DbConnect` for a custom user. See Aurora DSQL documentation for [IAM role connect][docs-dsql-iam]
and [authentication token generation][docs-generate-token] for more details.

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
default: &default
  adapter: postgresql
  encoding: unicode
  database: postgres
  pool: <%= ENV.fetch("RAILS_MAX_THREADS") { 5 } %>
  username: <%= ENV.fetch("CLUSTER_USER") { "admin" } %>
  host: <%= ENV['CLUSTER_ENDPOINT'] %>
  # Disable prepared statements and advisory locks for Aurora DSQL
  prepared_statements: false
  advisory_locks: false
  sslnegotiation: direct
  sslmode: verify-full
  # Amazon's root certs can be fetched from https://www.amazontrust.com/repository/
  sslrootcert: ./root.pem

development:
  <<: *default
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
