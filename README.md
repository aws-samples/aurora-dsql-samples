# Aurora DSQL Samples

This repository contains code examples that demonstrate how to use the [Aurora DSQL](https://aws.amazon.com/rds/aurora/dsql/).

To get started with Aurora DSQL, create clusters and more information, please refer to [AWS Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)

## How this repository is organized

The subdirectories contain code examples for connecting and using Aurora DSQL in each programming language and ORM framework. The examples demonstrate the most common uses, such as installing clients, handling authentication, performing CRUD operations, and more. Please refer to the [documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/known-issues.html) for a full list of differences and limitations.

|  Language   |                Client / ORM                |
| :---------: | :----------------------------------------: |
|     C++     |             [libpq](cpp/libpq)             |
| C# (dotnet) |          [npgsql](dotnet/npgsql)           |
|     Go      |               [pgx](go/pgx/)               |
|    Java     |           [pgjdbc](java/pgjdbc)            |
|    Java     |    [pgjdbc_hikari](java/pgjdbc_hikari)     |
| JavaScript  | [node-postgres](javascript/node-postgres/) |
| JavaScript  |   [postgres-js](javascript/postgres-js/)   |
|   Python    |         [psycopg](python/psycopg/)         |
|   Python    |        [psycopg2](python/psycopg2/)        |
|   Python    |      [sqlalchemy](python/sqlalchemy)       |
|    Ruby     |            [rails](ruby/rails)             |
|    Ruby     |          [ruby-pg](ruby/ruby-pg)           |
|    Rust     |             [sqlx](rust/sqlx)              |
| Typescript  |     [sequelize](typescript/sequelize)      |
| Typescript  |      [type-orm](typescript/type-orm)       |

|  Language   |                 Cluster Management                  |
| :---------: | :-------------------------------------------------: |
|     C++     |    [cluster_management](cpp/cluster_management)     |
| C# (dotnet) |   [cluster_management](dotnet/cluster_management)   |
|     Go      |     [cluster_management](go/cluster_management)     |
|    Java     |    [cluster_management](java/cluster_management)    |
| JavaScript  | [cluster_management](javascript/cluster_management) |
|   Python    |   [cluster_management](python/cluster_management)   |
|    Ruby     |    [cluster_management](ruby/cluster_management)    |
|    Rust     |    [cluster_management](rust/cluster_management)    |

Each example includes language and client-specific instructions as well as instructions to invoke example code.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This project is licensed under the MIT-0 License.
