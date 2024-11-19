PG::AWS_RDS_IAM.auth_token_generators.add :dsql do
  DsqlAuthTokenGenerator.new
end

require "aws-sigv4"
require_relative 'auth_token_generator'

class DsqlAuthTokenGenerator
  def call(host:, port:, user:)
    region = "us-east-1"
    credentials = Aws::SharedCredentials.new()

    token_generator = Aws::DSQL::AuthTokenGenerator.new({
        :credentials => credentials
    })

    # The token expiration time is optional, and the default value 900 seconds
    # if you are not using admin role, use generate_db_connect_auth_token instead
    token = token_generator.generate_db_connect_admin_auth_token({
        :endpoint => host,
        :region => region
    })

  end
end

# Monkey-patches to disable unsupported features

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
