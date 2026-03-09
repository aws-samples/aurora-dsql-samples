require "aurora_dsql_pg"
require "active_record/connection_adapters/postgresql_adapter"

# Inject DSQL authentication tokens into new database connections.
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

# Monkey-patches to disable unsupported DSQL features

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
