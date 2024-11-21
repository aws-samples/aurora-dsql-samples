# Ruby-pg with Aurora DSQL

## Table of Contents

1. Prerequisites

2. Using Ruby-pg to interact with Aurora DSQL

## Prerequisites

- [Created an AWS account and configured the credentials and AWS Region](https://alpha.www.docs.aws.a2z.com/sdkref/latest/guide/creds-config-files.html).

### Create Cluster

* You must have already provisioned a Aurora DSQL cluster following the [user guide](TBD)

### Driver Dependencies

Before using the Ruby-pg driver, ensure you have the following prerequisites installed:
Ruby: Ensure you have ruby v2.5+ installed from the [official website](https://www.ruby-lang.org/en/documentation/installation/).

Verify install

```bash
ruby --version
```

It should output something similar to `v3.2.6"`.

### Install Aurora DSQL Connection

- All the required dependencies are present in the `Gemfile` file. To get all the required dependencies, the following command

```bash
bundle install
```

### Using Ruby-pg to interact with Aurora DSQL

```ruby
require 'pg'
require 'aws-sdk-dsql'

def example()
  # Please replace with your own cluster endpoint
  cluster_endpoint = 'foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws'
  region = 'us-east-1'
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
        sslmode: 'verify-full',
        # Can be fetched from https://www.amazontrust.com/repository/
        sslrootcert: "<path to amazon's root certificate>"
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

  # Delete data that we just inserted
  conn.exec("DELETE FROM owner where name='John Doe'")

rescue => error
  puts error.full_message
ensure
  unless conn.nil?
    conn.finish()
  end
end

# Run the example
example()
```
