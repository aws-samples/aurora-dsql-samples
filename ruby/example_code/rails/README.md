# Ruby on Rails with Aurora DSQL

## Table of Contents

1. Prerequisites
   1. Create Cluster
   2. Driver Dependencies
   3. Install Driver

2. Execute Examples
   1. SQL CRUD Examples
      1. Create
      2. Read
      3. Update
      4. Delete
   2. Transaction with retries example
   3. Client Connection Pool example
   4. Primary key generation example
3. Token Session Management

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

Install required postgres jem

``` bash
gem install pg
bundle add pg
bundle install
```

### [TBD] Install DSQL Connection

- Detail required instructions for installing the language specific token generation jem
  - TBD as we currently don’t have the details of where the customer can obtain the jem


### [TBD] Connect to Cluster


## SQL CRUD Examples

> [!Important]
> To execute example code requires that you have AWS Credentials (eg AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN)


### Update cluster name

Edit the `./config/database.yml` to modify code to set "host: abcdefghijklmnopqrst123456.c0001.us-east-1.gamma.sql.axdb.aws.dev"

#### Console

The Ruby on Rails Console can be used to execute all of the standard CRUD functionality

``` bash
bin/rails console
```

### 1. Create Owner Tables

Following model definition for the Owner object exists in the `db/migrate/<time stamp>_create_owners.rb` file.  The example shows the use of the UUID type, which is required for use for id generation with Aurora DSQL.

``` ruby

class CreateOwners < ActiveRecord::Migration[7.2]
  def change
    create_table :owners, id: :uuid do |t|
      t.string :name, limit: 30
      t.string :city, limit: 80
      t.string :telephone, limit: 20

      t.timestamps
    end
  end
end

```

Create the database and generate the model from the model files in `db/migrate`.

``` bash
bin/rails db:create
bin/rails db:migrate
```

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

## [TBD] Transaction with retries example

Add text to describe that Aurora DSQL requires that in order to handle OC001 error issue the code logic needs to support a transaction retries (Recommend example should be example of the simple CRUD examples and extended to show transaction retries)

TODO Example of transaction retries - This section will be added later


