# frozen_string_literal: true

# =============================================================================
# Aurora DSQL Adapter Initializer
# =============================================================================
#
# This initializer configures Active Record's PostgreSQL adapter to work with
# Amazon Aurora DSQL. It only activates in production where PostgreSQL/DSQL
# is used. In development/test, SQLite3 is used instead.
#
# When active, it:
#   1. Injects IAM authentication tokens into new database connections
#   2. Disables PostgreSQL features not supported by Aurora DSQL
#
# Required gems (production only):
#   - aurora-dsql-ruby-pg (provides AuroraDsql::Pg::Token and Util)
#   - pg (PostgreSQL driver)
# =============================================================================

# Only load DSQL adapter patches when using PostgreSQL (production)
return unless ActiveRecord::Base.configurations.configs_for(env_name: Rails.env).first&.adapter == "postgresql"

require "aurora_dsql_pg"
require "active_record/connection_adapters/postgresql_adapter"

# -----------------------------------------------------------------------------
# IAM Token Authentication
# -----------------------------------------------------------------------------
module DsqlTokenAuthentication
  def new_client(conn_params)
    host = conn_params[:host]

    if host&.include?(".dsql.")
      region = AuroraDsql::Pg::Util.parse_region(host)

      begin
        conn_params[:password] = AuroraDsql::Pg::Token.generate(
          host: host,
          region: region,
          user: conn_params[:user] || "admin"
        )
      rescue => e
        Rails.logger.error("Failed to generate DSQL auth token: #{e.message}")
        raise
      end
    end

    super
  end
end

ActiveRecord::ConnectionAdapters::PostgreSQLAdapter.singleton_class.prepend(DsqlTokenAuthentication)

# -----------------------------------------------------------------------------
# Disable Unsupported DSQL Features
# -----------------------------------------------------------------------------
require "active_record/connection_adapters/postgresql/schema_statements"

module ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements
  def client_min_messages=(level); end
end

class ActiveRecord::ConnectionAdapters::PostgreSQLAdapter
  def set_standard_conforming_strings; end

  def supports_ddl_transactions?
    false
  end
end
