require 'pg'
require 'aws-sdk-dsql'

def example(cluster_endpoint, region)
  credentials = Aws::SharedCredentials.new()

  begin
      token_generator = Aws::DSQL::AuthTokenGenerator.new({
          :credentials => credentials
      })
      
      # The token expiration time is optional, and the default value 900 seconds
      # if you are not using admin role, use generate_db_connect_auth_token instead
      token = token_generator.generate_db_connect_admin_auth_token({
          :endpoint => cluster_endpoint,
          :region => region
      })

      conn = PG.connect(
        host: cluster_endpoint,
        user: 'admin',
        password: token,
        dbname: 'postgres',
        port: 5432,
        sslmode: 'require'
      )
  rescue => _error
      raise
  end

  # Create the owner table
  conn.exec('CREATE TABLE IF NOT EXISTS owner (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(30) NOT NULL,
    city VARCHAR(80) NOT NULL,
    telephone VARCHAR(20)
  )')

  # Insert an owner
  conn.exec_params('INSERT INTO owner(name, city, telephone) VALUES($1, $2, $3)',
    ['John Doe', 'Anytown', '555-555-0055'])

  # Read the result back
  result = conn.exec("SELECT city FROM owner where name='John Doe'")

  # Raise error if we are unable to read
  raise "must have fetched a row" unless result.ntuples == 1
  raise "must have fetched right city" unless result[0]["city"] == 'Anytown'

  # Delete data we just inserted
  conn.exec("DELETE FROM owner where name='John Doe'")

rescue => error
  puts error.full_message
ensure
  unless conn.nil?
    conn.finish()
  end
end

# Run the example
example(ENV["CLUSTER_ENDPOINT"], ENV["REGION"])
