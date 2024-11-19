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
4. Relational Mapping Examples

## Prerequisites

### Create Cluster

You can access the AWS Management Console for Amazon DSQL at https://console.aws.amazon.com/dsql/home (TBD Update this link before launch)

    * 1. Login to console
    * 2. Create Cluster

        * Accept defaults for example applications
        * Create Cluster


### Driver Dependencies

Rails 7.2 requires Ruby 3.1.0 or newer, and our example is tested with Ruby 3.3.5.
You can download Ruby from the [official website](https://www.ruby-lang.org/en/downloads/).

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

Install required gems

``` bash
bundle install
```

### Install Aurora DSQL Connection

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
require_relative 'auth_token_generator'

class DsqlAuthTokenGenerator
  def call(host:, port:, user:)
    region = "us-east-1"
    credentials = Aws::SharedCredentials.new()

    token_generator = Aws::DSQL::AuthTokenGenerator.new({
        :credentials => credentials
    })

    # The token expiration time is optional, and the default value 900 seconds
    # if you are not using admin role, use generate_db_connect_auth_token instead
    token = token_generator.generate_db_connect_admin_auth_token({
        :endpoint => host,
        :region => region
    })

  end
end

# Monkey-patches to disable unsupported features

require "active_record/connection_adapters/postgresql/schema_statements"

module ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements
  # DSQL does not support setting min_messages in the connection parameters
  def client_min_messages=(level); end
end

require "active_record/connection_adapters/postgresql_adapter"

class ActiveRecord::ConnectionAdapters::PostgreSQLAdapter

  def set_standard_conforming_strings; end

  # Avoid error running multiple DDL or DDL + DML statements in the same transaction
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
  # host: {clusterId}.dsql.{region}.on.aws
  host: foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws

  sslmode: verify-full
  # Provide the path to the root certificate. 
  # Amazon's root certs can be fetched from https://www.amazontrust.com/repository/
  sslrootcert: <replace with the path to root certificate>

  # Remember that we defined dsql token generator in the `{app root directory}/config/initializers/adapter.rb`
  # We are providing it as the token generator to the adapter here.
  aws_rds_iam_auth_token_generator: dsql
  advisory_locks: false
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

Generate the schema from the model files in db/migrate.

``` bash
bin/rails db:migrate
```

Finally, disable the `plpgsql` extension by modifying the `{app root directory}/db/schema.rb` . In order to disable the plpgsql extension, remove the `enable_extension "plgsql"` line.

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

## Relational Mapping Examples

The pet clinic example code base also contains some of the typical ralationships that are often
used in an ORM type application.  This includes representations of one-to-one, one-to-many and
also many-to-many definitions.  The following examples show how these are supported within
Aurora DSQL, and enable building relational structured models in this environment.  The various
model definitions capturing the relationships can be found in the `app/models` directory.

The following examples will reuse the same owner instantiation created here.

``` console
john_smith = Owner.new(name: "John Smith", city: "Seattle", telephone: "123-456-7890")
john_smith.save
```

### One-to-One Mapping

For the pet clinic example app, there is a one-to-many relationship defined between the owner and
pet model.  This can be observed in the code snippets below taken from the `app/models/owner.rb`
model definition that shows the association.

``` ruby
class Owner < ApplicationRecord
  ...
  has_one :vet
```

Create a vet instantiation, associate it with the owner, then read it back to test the association.

``` console
dr_bob_best = Vet.create(name: "Dr. Bob Best")
john_smith.vet=dr_bob_best
john_smith.vet
```

### One-to-Many Mapping

For the pet clinic example app, there is a one-to-many relationship defined between the owner and
pet models.  This can be observed in the code snippets below taken from the `app/models/owner.rb` and
the `app/models/pet.rb` model definitions respectively.

``` ruby
class Owner < ApplicationRecord
  has_many :pets, dependent: :destroy
```

``` ruby
class Pet < ApplicationRecord
  belongs_to :owner
```

Create an owner with multiple pet instances, and then read the list of pets belonging to the owner.
When the owner is deleted, the pets owned will be removed from the system.

``` console
fido = john_smith.pets.create(name: "Fido", birth_date: "2022-01-17")
rex = john_smith.pets.create(name: "Rex", birth_date: "2023-10-01")
john_smith.pets
```

### Many-to-Many Mapping

For the pet clinic example app, there is a many-to-many relationship defined between a vet and a set
of specialties that a particular vet has.  The relationship definition in this case makes use of an
intermediary join table to map any number of vet instances to any number of skills that they possess.
The definition for these relationships can be seen in the `app/models/vet.rb` and `app/models/specialty.rb`
models, and in the `app/models/vet_specialty.rb` model which maintains the relationship data in a join table.

``` ruby
class Vet < ApplicationRecord
  has_many :vet_specialties , dependent: :delete_all
  has_many :specialties, through: :vet_specialties
```

``` ruby
class Specialty < ApplicationRecord
  has_many :vet_specialties
  has_many :vets, through: :vet_specialties
```

``` ruby
class VetSpecialty < ApplicationRecord
  belongs_to :vet
  belongs_to :specialty
```

Create a set of specialties for a vet and read this list back.  The specialties created
in this example will exist even after the vet has been removed from the system.  Only
the relationship captured in the vet specialties table will be removed on vet deletion.

``` console
  small_pets = Specialty.create(name: "small pets")
  minor_surgery = Specialty.create(name: "minor surgery")
  dr_bob_best.specialties << small_pets
  dr_bob_best.specialties << minor_surgery
  dr_bob_best.specialties
```

In order to see the many-to-many relationship mapping between all vets and specialties,
retrieve the contents of the three tables with the following commands.

``` console
Vet.all
Specialty.all
VetSpecialty.all
```

