# Ruby SDK examples for generating Aurora DSQL authentication tokens

# --8<-- [start:ruby-generate-token]
require 'aws-sdk-dsql'

def generate_token(your_cluster_endpoint, region)
  credentials = Aws::SharedCredentials.new()

  begin
      token_generator = Aws::DSQL::AuthTokenGenerator.new({
          :credentials => credentials
      })
      
      # if you're not using admin role, use generate_db_connect_auth_token instead
      token = token_generator.generate_db_connect_admin_auth_token({
          :endpoint => your_cluster_endpoint,
          :region => region
      })
  rescue => error
    puts error.full_message
  end
end
# --8<-- [end:ruby-generate-token]