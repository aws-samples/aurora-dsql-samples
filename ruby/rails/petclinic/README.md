# Aurora DSQL Pet Clinic
This example demonstrates how to use an Aurora DSQL cluster with a Ruby On Rails
application. Aurora DSQL only supports token-based authentication so we extend the
[`pg-aws_rds_iam`][rds-plugin-repo] plugin to generate Aurora DSQL auth tokens
when required.

It also includes changes to ActiveRecord behavior to be compatible with Aurora DSQL
supported features.

[rds-plugin-repo]: https://github.com/haines/pg-aws_rds_iam

## ⚠️ Important

- Running this code might result in charges to your AWS account.
- Running the tests might result in charges to your AWS account.
- We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
- This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

## TLS connection configuration

This example uses direct TLS connections where supported, and verifies the server certificate is trusted. Verified SSL
connections should be used where possible to ensure data security during transmission.

* Driver versions following the release of PostgreSQL 17 support direct TLS connections, bypassing the traditional
  PostgreSQL connection preamble
* Direct TLS connections provide improved connection performance and enhanced security
* Not all PostgreSQL drivers support direct TLS connections yet, or only in recent versions following PostgreSQL 17
* Ensure your installed driver version supports direct TLS negotiation, or use a version that is at least as recent as
  the one used in this sample
* If your driver doesn't support direct TLS connections, you may need to use the traditional preamble connection instead

## Prerequisites

* You must have an AWS account, and have your default credentials and AWS Region
  configured as described in the
  [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html)
  guide.
* [Ruby 3.3.5](https://www.ruby-lang.org) or later.
* You must have an Aurora DSQL cluster. For information about creating an Aurora DSQL cluster, see the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
  guide.
* If connecting as a non-admin user, ensure the user is linked to an IAM role and is granted access to the `myschema`
  schema. See the
  [Using database roles with IAM roles](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html)
  guide.

## Quick start
Install ruby 3.3.5 with [rbenv](https://github.com/rbenv/rbenv):
```sh
rbenv install 3.3.5
```

Install the Rails application:
```sh
cd petclinic

# Download the Amazon root certificate from the official trust store:
wget https://www.amazontrust.com/repository/AmazonRootCA1.pem -O root.pem

bundle install
```

Prepare the schema and open an interactive console:
```sh
export CLUSTER_ENDPOINT="<your cluster endpoint>"

# Generate the schema from the model files in db/migrate.
bin/rails db:migrate

# Start the rails console
bin/rails console
```

## Working with the example model
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

### 2. Create Owner

```
owner = Owner.new(name: "John Doe", city: "Anytown", telephone: "555-555-0150")
owner.save
owner
```

### 3. Read Owner

```
Owner.find("<owner id>")
```

### 4. Update Owner

```
Owner.find("<owner id>").update(telephone: "555-555-0123")
```

### 5. Delete Owner

```
Owner.find("<owner id>").destroy
```

## Relational Mapping Examples

The pet clinic example code base contains some of the typical ralationships that are often
used in an ORM type application. This includes representations of one-to-one, one-to-many and
also many-to-many definitions.The following examples show how to support these scenarios within
Aurora DSQL, and enable building relational structured models in this environment.  The various
model definitions capturing the relationships can be found in the `app/models` directory.

The following examples will reuse the same owner instantiation created here.

```
john_doe = Owner.new(name: "John Doe", city: "Anytown", telephone: "555-555-0150")
john_doe.save
```

### One-to-One Mapping

For the pet clinic example app, there is a one-to-many relationship defined between the owner and
pet model.  This can be observed in the code snippets below taken from the `app/models/owner.rb`
model definition that shows the association.

```ruby
class Owner < ApplicationRecord
  ...
  has_one :vet
```

Create a vet instantiation, associate it with the owner, then read it back to test the association.

```
dr_carlos_salazar = Vet.create(name: "Dr. Carlos Salazar")
john_doe.vet=dr_carlos_salazar
john_doe.vet
```

### One-to-Many Mapping

For the pet clinic example app, there is a one-to-many relationship defined between the owner and
pet models.  This can be observed in the code snippets below taken from the `app/models/owner.rb` and
the `app/models/pet.rb` model definitions respectively.

```ruby
class Owner < ApplicationRecord
  has_many :pets, dependent: :destroy
```

```ruby
class Pet < ApplicationRecord
  belongs_to :owner
```

Create an owner with multiple pet instances, and then read the list of pets belonging to the owner.
When the owner is deleted, the pets owned will be removed from the system.

```
pet1 = john_doe.pets.create(name: "Pet-1", birth_date: "2022-01-17")
pet2 = john_doe.pets.create(name: "Pet-2", birth_date: "2023-10-01")
john_doe.pets
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

```
small_pets = Specialty.create(name: "small pets")
minor_surgery = Specialty.create(name: "minor surgery")
dr_carlos_salazar.specialties << small_pets
dr_carlos_salazar.specialties << minor_surgery
dr_carlos_salazar.specialties
```

In order to see the many-to-many relationship mapping between all vets and specialties,
retrieve the contents of the three tables with the following commands.

```
Vet.all
Specialty.all
VetSpecialty.all
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0