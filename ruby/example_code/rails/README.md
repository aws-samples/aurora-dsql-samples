# Ruby on Rails with Aurora DSQL

## Table of Contents

1. Prerequisites
2. Configure active record adapter
3. Execute Examples
   1. SQL CRUD Examples
      1. Create
      2. Read
      3. Update
      4. Delete

## Prerequisites

### Create Cluster

You can access the AWS Management Console for Amazon DSQL at https://console.aws.amazon.com/dsql/home (TBD Update this link before launch)

    * 1. Login to console
    * 2. Create Cluster

        * Accept defaults for example applications
        * Create Cluster


### Driver Dependencies

Rails 7.2 requires Ruby 3.1.0 or newer. You can download Ruby from the [official website](https://www.ruby-lang.org/en/downloads/). 

Verify install
```bash
ruby --version
```

It should output something similar to `ruby 3.3.5`.

Ruby on Rails: 

You can download Ruby On Rails from the [official website](https://gorails.com/setup). 

Verify install
```bash
rails --version
```

Install required postgres gem

``` bash
bundle install
```

### Install DSQL Connection

#### Configure the connection adapter for Aurora DSQL

Aurora DSQL uses IAM as the authentication and authorization mechanism to establish a connection.
A password cannot be provided directly to rails through configuration in the `{app root directory}/config/database.yml` file.
We are going to re-use the `pg-aws_rds_iam` adapter to inject our own DB auth token as the password
for Aurora DSQL. Follow the steps below to configure this.

##### Customize the `pg-aws_rds_iam` adapter
Create a file `{app root directory}/config/initializers/adapter.rb` with following contents

```ruby
PG::AWS_RDS_IAM.auth_token_generators.add :dsql do
  DsqlAuthTokenGenerator.new
end

require "aws-sigv4"

# This is our custom DB auth token generator
# TODO: Once the aws-sdk for DSQL is available change token generation mechanism.
# use the ruby sdk to generate token instead.
class DsqlAuthTokenGenerator
  def call(host:, port:, user:)
    action = <DB Connect action> # "DbConnectAdmin or DbConnect" 
    expires_in = 10
    region = <cluster region> # Eg: "us-east-1"
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

    # Remove extra scheme for token
    presigned_url[8..-1]
  end
end

# Monkey-patches to disable unsupported features

require "active_record/connection_adapters/postgresql/schema_statements"

module ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements
  # Aurora DSQL does not support setting min_messages in the connection parameters
  def client_min_messages=(level); end
end

require "active_record/connection_adapters/postgresql_adapter"

class ActiveRecord::ConnectionAdapters::PostgreSQLAdapter

  def set_standard_conforming_strings; end

  # Aurora DSQL does not support running multiple DDL or DDL + DML statements in the same transaction
  def supports_ddl_transactions?
    false
  end
end

```

##### Use the adapter in database configuration
Define the following in the `{app root directory}/config/database.yml` file. Following example shows the
configuration for the development database. You can do similar setup for test
and production databases.

```yml
development:
  <<: *default
  database: postgres

  # The specified database role being used to connect to PostgreSQL.
  # To create additional roles in PostgreSQL see `$ createuser --help`.
  # When left blank, PostgreSQL will use the default role. This is
  # the same name as the operating system user running Rails.
  username: <postgres username> # eg: admin or other postgres users

  # Connect on a TCP socket. Omitted by default since the client uses a
  # domain socket that doesn't need configuration. Windows does not have
  # domain sockets, so uncomment these lines.
  # host: localhost
  # Set to Aurora DSQL instance hostname
  # host: <Aurora DSQL hostname>.c0001.us-east-1.gamma.sql.axdb.aws.dev
  host: <cluster endpoint>

  # Remember that we defined dsql token generator in the `{app root directory}/config/initializers/adapter.rb`
  # We are providing it as the token generator to the adapter here.
  aws_rds_iam_auth_token_generator: dsql
  advisory_locks: false
  # TODO: Check if this really needs to be disabled
  prepared_statements: false
```

With this, every time a new connection is needed, a token is automatically generated
and injected into the connection parameters by the adapter.

### 1. Create Owner Model

Let's assume we are creating a table that stores list of pet owners. Create corresponding
model using

```sh
# Execute in the app root directory
bin/rails generate model Owner name:string city:string telephone:string
```

This will create a model (`app/models/owner.rb`) file and a migration file (`db/migrate/<time stamp>_create_owners.rb`)
Change the model file to explicitly specify the primary key of the table. 
Unlike postgres, by default, Aurora DSQL creates a primary key index by including
all columns of the table. This makes active record to search using all columns of
the table instead of just primary key. So the `<Entity>.find(<primary key>)` will not
work because active record tries to search using all columns in the primary key index.
`.find_by(<cloumn name>: "<value>")` works fine. To make active record search only
using primary key column by default, we must set the primary key column explicitly 
in the model as shown below.

```ruby
class Owner < ApplicationRecord
  self.primary_key = "id"
end
```

Finally, create the database and generate the schema from the model files in `db/migrate`.

``` bash
bin/rails db:migrate
```

## CRUD Examples

### 2. Create Owner

``` console
owner = Owner.new(name: "John Smith", city: "Seattle", telephone: "123-456-7890")
owner.save
owner
```

### 3. Read Owner

``` console
Owner.find("<owner id>")
```

### 4. Update Owner

``` console
Owner.find("<owner id>").update(telephone: "123-456-7891")
```

### 5. Delete Owner

``` console
Owner.find("<owner id>").destroy
```
