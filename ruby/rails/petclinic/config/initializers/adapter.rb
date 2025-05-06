PG::AWS_RDS_IAM.auth_token_generators.add :dsql do
  DsqlAuthTokenGenerator.new
end

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
