require 'pg'
require_relative 'token_generator'

module ConnectionUtil
    def get_connection(cluster_endpoint, region)
        action = "DbConnectSuperUser"
        expires_in = 3600

        access_key_id = ENV['AWS_ACCESS_KEY_ID']
        secret_access_key = ENV['AWS_SECRET_ACCESS_KEY']
        session_token = ENV['AWS_SESSION_TOKEN']

        credentials = Aws::Credentials.new(access_key_id, secret_access_key, session_token)

        begin
            token_gen = Aws::AxdbFrontend::AuthTokenGenerator.new({
                :credentials => credentials
            })
        
            token = token_gen.generate_db_connect_superuser_auth_token({
                :endpoint => cluster_endpoint,
                :region => region,
                :expires_in => 3600
            })

            pg_connection = PG.connect(
                            host: cluster_endpoint,
                            user: 'axdb_superuser',
                            password: token,
                            dbname: 'postgres',
                            port: 5432,
                            sslmode: 'require'
            )
            return pg_connection
        rescue => error
            raise
        end
    end
    module_function :get_connection
end
