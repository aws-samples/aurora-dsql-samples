require 'pg'
require_relative 'token_generator'

module ConnectionUtil
    def get_connection(cluster_endpoint, region)
        action = "DbConnectSuperUser"

        credentials = Aws::SharedCredentials.new()

        begin
            token_gen = Aws::AxdbFrontend::AuthTokenGenerator.new({
                :credentials => credentials
            })
            
            # The token expiration time is optional, and the default value 900 seconds
            token = token_gen.generate_db_connect_superuser_auth_token({
                :endpoint => cluster_endpoint,
                :region => region
            })

            pg_connection = PG.connect(
                            host: cluster_endpoint,
                            user: 'admin',
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
