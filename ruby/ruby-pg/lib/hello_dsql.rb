require 'pg'
require 'aws-sdk-dsql'

def create_connection(cluster_user, cluster_endpoint, region)
  # Generate a fresh password token for each connection, to ensure the token is not expired
  # when the connection is established
  credentials = Aws::CredentialProviderChain.new.resolve
  token_generator = Aws::DSQL::AuthTokenGenerator.new({
          :credentials => credentials
      })

  auth_token_params = {
        endpoint: cluster_endpoint,
        region: region,
        expires_in: 15 * 60 # 15 minutes, optional
  }
  
  case cluster_user
  when "admin" 
    password_token = token_generator.generate_db_connect_admin_auth_token(auth_token_params)
  else
    password_token = token_generator.generate_db_connect_auth_token(auth_token_params)
  end 

  conn_params = {
    host: cluster_endpoint,
    user: cluster_user,
    password: password_token,
    dbname: 'postgres',
    port: 5432,
    sslmode: 'verify-full',
    sslrootcert: "./root.pem"
  }

  # Use the more efficient connection method if it's supported.
  if PG::library_version >= 170000
    conn_params[:sslnegotiation] = "direct"
  end

  PG.connect(conn_params)
end

def example(conn)

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

end

def main() 
  # Use environment variables.
  cluster_endpoint = ENV["CLUSTER_ENDPOINT"]
  region = ENV["REGION"]
  cluster_user = ENV["CLUSTER_USER"] 

  # Raise errors if any of the variables are not set.
  raise "CLUSTER_ENDPOINT environment variable is not set" unless cluster_endpoint
  raise "REGION environment variable is not set" unless region
  raise "CLUSTER_USER environment variable is not set" unless cluster_user
  
  begin
    conn = create_connection(cluster_user, cluster_endpoint, region)
    if cluster_user != 'admin'
      conn.exec("SET search_path = myschema")
    end
    example(conn)
    puts "Ruby test passed"
  rescue => error
    puts error.full_message
    puts "Ruby test failed"
    raise
  ensure
    conn.close if conn
  end
end 

if __FILE__ == $0
  main() 
end
