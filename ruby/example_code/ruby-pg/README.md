# Ruby-pg with Aurora DSQL

## Table of Contents

1. Prerequisites

2. SQL CRUD Examples
   1. Create
   2. Read
   3. Update
   4. Delete

## Prerequisites

You must have a `default` profile in your `~/.aws/credentials` file with the following variables
  * `aws_access_key_id=<your_access_key_id>`
  * `aws_secret_access_key=<your_secret_access_key>`
  * `aws_session_token=<your_session_token>`

Your `~/.aws/credentials` file should look as depicted below

```bash
[default]
aws_access_key_id=<your_access_key_id>
aws_secret_access_key=<your_secret_access_key>
aws_session_token=<your_session_token>
```

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

### Install DSQL Connection

- All the required dependencies are present in the `Gemfile` file. To get all the required dependencies, the following command

```bash
bundle install
```

### Connect to the Aurora DSQL Cluster

Via Ruby

```ruby
require 'pg'
require_relative 'token-generator'

module ConnectionUtil
    def get_connection(cluster_endpoint, region)
        action = "DbConnectSuperUser"
        expires_in = 3600

        credentials = Aws::SharedCredentials.new()

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
```

## SQL CRUD Examples

### 1. Create Owner Table

Note that DSL does not support SERIAL so id is based on uuid see (suggest best practice guide on this)

```ruby
def create_tables(conn)
  conn.exec('CREATE TABLE IF NOT EXISTS owner (
    id UUID PRIMARY KEY,
    name VARCHAR(30) NOT NULL,
    city VARCHAR(80) NOT NULL,
    telephone VARCHAR(20)
  )')
end
```

### 2. Create Owner

```ruby

def create_owner(conn)
  conn.exec_params('INSERT INTO owner(id, name, city, telephone) VALUES($1, $2, $3, $4)', [SecureRandom.uuid, 'John Doe', 'Las Vegas', '555-555-5555'])
end
```

### 3. Read Owner

```ruby
def read_owner(conn)
  pg_result = conn.exec('SELECT * FROM owner')
  pg_result.each do |row|
    puts row
  end
end
```

### 4. Update Owner

```ruby
def update_owner(conn)
  conn.exec('UPDATE owner SET telephone = $1 WHERE name = $2', ['888-888-8888', 'John Doe'])
end
```

### 5. Delete Owner

```ruby
def delete_owner(conn)
  conn.exec_params('DELETE FROM owner WHERE name = $1', ['John Doe'])
end
```

### 6. Terminate Connection

```ruby
conn.finish()
```
