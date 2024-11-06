PG::AWS_RDS_IAM.auth_token_generators.add :dsql do
  DsqlAuthTokenGenerator.new
end

require "aws-sigv4"

class DsqlAuthTokenGenerator
  def call(host:, port:, user:)
    action = "DbConnectAdmin"
    expires_in = 10
    region = "us-east-1"
    service = "xanadu"
    param_list = Aws::Query::ParamList.new
    param_list.set("Action", action)
    param_list.set("DBUser", user)

    signer = Aws::Sigv4::Signer.new(
      service: service,
      region: region,
      credentials_provider: Aws::SharedCredentials.new()
    )

    presigned_url = signer.presign_url(
      http_method: "GET",
      url: "https://#{host}/?#{param_list}",
      body: "",
      expires_in: expires_in
    ).to_s

    print "Generated presigned URL: #{presigned_url}\n"
    # Remove extra scheme for token
    presigned_url[8..-1]
  end
end

# Monkey-patches to disable unsupported features

require "active_record/connection_adapters/postgresql/schema_statements"

module ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements
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
