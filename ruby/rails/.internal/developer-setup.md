# AWS DSQL Ruby on Rails code examples

_For AWS internal distribution only_

## Overview

The code examples in this topic show you how to use the Ruby on Rails work with AWS DSQL.

## Run the examples

### 1. Set up ruby environment

Install ruby 3.3.5 for Cloud Desktop:
```sh
sudo yum install -y libyaml-devel
rbenv install 3.3.5
```

See [`rbenv` docs](https://github.com/rbenv/rbenv) for instructions on activating `rbenv` and integrating it
into your shell.

### 2. Install the app
```sh
cd petclinic

# Sanity check rbenv setup
which ruby
# should be your rbenv dir, defaults to $HOME/.rbenv/shims/ruby

ruby --version
# should be 3.3.5

# Will install dependencies with your rbenv shim. NOT system ruby!
bundle install
```

Get the latest CA for AWS SDKs
```sh
# Place this in the 'petclinic' root. Should agree with the 'sslrootcert' location
# in 'config/database.yml'
wget https://www.amazontrust.com/repository/AmazonRootCA1.pem -O root.pem
```

### 3. Interact with the cluster via console
```sh
export CLUSTER_ENDPOINT="huabttnonxz4oajpjn53txpdue.dsql-gamma.us-east-1.on.aws"

# For the 'admin' database user (default)
ada credentials update --role=Admin --account 864899869023 --once

bin/rails console
```

To run as a non-Admin user:
1. `export CLUSTER_USER="non_admin_user"`
1. Set credentials with `ada credentials update --role=DbConnectRole --account 864899869023 --once`

The `bin/rails console` command launches an interactive session that will issue queries to the cluster. A working
console looks like this:
```
❯ bin/rails console
Loading development environment (Rails 7.2.1.2)
petclinic(dev)> Owner.all
  Owner Load (2158.7ms)  SELECT "owners".* FROM "owners" /* loading for pp */ LIMIT 11
=> []
```