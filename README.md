# Aurora DSQL (Distributed SQL) Samples

This repository contains code examples that demonstrate how to use the [Aurora DSQL](https://aws.amazon.com/rds/aurora/dsql/).

To get started with Aurora DSQL, create clusters and more information, please refer to [AWS Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)

## How this repository is organized

The subdirectories contain code examples for connecting and using Aurora DSQL in each programming language and ORM framework. The examples demonstrate the most common uses, such as installing clients, handling authentication, performing CRUD operations, and more. Please refer to the [documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/known-issues.html) for a full list of differences and limitations.

|  Language   |          Client / ORM           |                 Cluster Management                  |                README                 |
| :---------: | :-----------------------------: | :-------------------------------------------------: | :-----------------------------------: |
|     C++     |       [libpq](cpp/libpq)        |    [cluster_management](cpp/cluster_management)     |     [README](cpp/libpq/README.md)     |
| C# (dotnet) |     [npgsql](dotnet/npgsql)     |   [cluster_management](dotnet/cluster_management)   |   [README](dotnet/npgsql/README.md)   |
|    Java     |      [pgjdbc](java/pgjdbc)      |    [cluster_management](java/cluster_management)    |    [README](java/pgjdbc/README.md)    |
|     Go      |          [go](go/pgx/)          |              [cluster_management](TBD)              |      [README](go/pgx/README.md)       |
| Javascript  |  [nodejs](javascript/nodejs/)   | [cluster_management](javascript/cluster_management) | [README](javascript/nodejs/README.md) |
|   Python    |   [psycopg](python/psycopg/)    |   [cluster_management](python/cluster_management)   |  [README](python/psycopg/README.md)   |
|   Python    |  [psycopg2](python/psycopg2/)   |   [cluster_management](python/cluster_management)   |  [README](python/psycopg2/README.md)  |
|   Python    | [sqlalchemy](python/sqlalchemy) |   [cluster_management](python/cluster_management)   | [README](python/sqlalchemy/README.md) |
|    Ruby     |       [rails](ruby/rails)       |    [cluster_management](ruby/cluster_management)    |    [README](ruby/rails/README.md)     |
|    Ruby     |     [ruby-pg](ruby/ruby-pg)     |    [cluster_management](ruby/cluster_management)    |   [README](ruby/ruby-pg/README.md)    |
|    Rust     |        [sqlx](rust/sqlx)        |    [cluster_management](rust/cluster_management)    |     [README](rust/sqlx/README.md)     |

Each example includes language and client-specific instructions as well as instructions to invoke example code.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This project is licensed under the Apache-2.0 License.
