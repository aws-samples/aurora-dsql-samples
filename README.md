# Aurora DSQL Samples

[![Discord chat](https://img.shields.io/discord/1435027294837276802.svg?logo=discord)](https://discord.com/invite/nEF6ksFWru)

This repository contains code examples that demonstrate how to use the [Aurora DSQL](https://aws.amazon.com/rds/aurora/dsql/).

To get started with Aurora DSQL, create clusters and more information, please refer to [AWS Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)

## How this repository is organized

The subdirectories contain code examples for connecting and using Aurora DSQL in each programming language and ORM framework. The examples demonstrate the most common uses, such as installing clients, handling authentication, performing CRUD operations, and more. Please refer to the [documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/known-issues.html) for a full list of differences and limitations.

|  Language   |                      Client / ORM                       |
|:-----------:|:-------------------------------------------------------:|
|     C++     |                   [libpq](cpp/libpq)                    |
| C# (dotnet) |                 [Npgsql](dotnet/npgsql)                 |
|     Go      |                     [pgx](go/pgx/)                      |
|    Java     |            [HikariCP + pgJDBC](java/pgjdbc)             |
|    Java     |               [Liquibase](java/liquibase)               |
|    Java     |             [Spring Boot](java/spring_boot)             |
| JavaScript  |          [AWS Lambda + node-postgres](lambda/)          |
| JavaScript  | [node-postgres (standalone)](javascript/node-postgres/) |
| JavaScript  |         [Postgres.js](javascript/postgres-js/)          |
|   Python    |                [asyncpg](python/asyncpg)                |
|   Python    |                [Jupyter](python/jupyter)                |
|   Python    |               [psycopg](python/psycopg/)                |
|   Python    |              [psycopg2](python/psycopg2/)               |
|   Python    |             [SQLAlchemy](python/sqlalchemy)             |
|    Ruby     |                   [pg](ruby/ruby-pg)                    |
|    Ruby     |                   [Rails](ruby/rails)                   |
|    Rust     |                    [sqlx](rust/sqlx)                    |
| Typescript  |               [Prisma](typescript/prisma)               |
| Typescript  |            [Sequelize](typescript/sequelize)            |
| Typescript  |             [TypeORM](typescript/type-orm)              |


|  Language   |                 Cluster Management                  |
|:-----------:|:---------------------------------------------------:|
|     C++     |    [cluster_management](cpp/cluster_management)     |
| C# (dotnet) |   [cluster_management](dotnet/cluster_management)   |
|     Go      |     [cluster_management](go/cluster_management)     |
|    Java     |    [cluster_management](java/cluster_management)    |
| JavaScript  | [cluster_management](javascript/cluster_management) |
|   Python    |   [cluster_management](python/cluster_management)   |
|    Ruby     |    [cluster_management](ruby/cluster_management)    |
|    Rust     |    [cluster_management](rust/cluster_management)    |


|  Language   |                    Token Generation                     |
|:-----------:|:-------------------------------------------------------:|
|     CLI     |          [generate_token](cli/authentication)           |
|     C++     |          [generate_token](cpp/authentication)           |
| C# (dotnet) |         [generate_token](dotnet/authentication)         |
|     Go      |           [generate_token](go/authentication)           |
|    Java     |          [generate_token](java/authentication)          |
| JavaScript  |       [generate_token](javascript/authentication)       |
|   Python    |         [generate_token](python/authentication)         |
|    Ruby     |          [generate_token](ruby/authentication)          |
|    Rust     |          [generate_token](rust/authentication)          |

Each example includes language and client-specific instructions as well as instructions to invoke example code.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This project is licensed under the MIT-0 License.
