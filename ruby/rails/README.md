# Aurora DSQL Ruby on Rails code examples

## Overview

The code examples in this topic show you how to use the Ruby on Rails work with Aurora DSQL. 

## Run the examples

### Prerequisites

* ruby version == 3.3.5 is needed

### Setup test running environment 

Install ruby 3.3.5 for Cloud Desktop:
```
sudo yum install -y libyaml-devel
rbenv install 3.3.5
```

### Run the example tests
Open a Ruby on Rails app console to manually test console commands:

```
# Use the account credentials dedicated for Ruby on Rails

# Download the Amazon root certificate from the official trust store
# This example shows one of the available certs that can be used by the client;
# other certs such as AmazonRootCA2.pem, AmazonRootCA3.pem, etc. can also be used.
wget https://www.amazontrust.com/repository/AmazonRootCA1.pem -O root.pem

export CLUSTER_ENDPOINT="<your cluster endpoint from us-east-1>"
cd petclinic
bundle install
bin/rails console
```
