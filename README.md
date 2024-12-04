# Aurora DSQL (Distributed SQL) Samples

This repository contains code examples that demonstrate how to use the [Aurora DSQL](https://aws.amazon.com/rds/aurora/dsql/).

To get started with Aurora DSQL, create clusters and more information, please refer to [AWS Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)

## How this repository is organized

The subdirectories contain code examples for connecting and using Aurora DSQL in each programming language and ORM framework. The examples demonstrate the most common uses, such as installing clients, handling authentication, performing CRUD operations, and more. They also cover Aurora DSQL's basic specifics. Please refer to the [documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/known-issues.html) for a full list of differences and limitations.

|  Language   |          Client / ORM           |                   HowTO                   |
| :---------: | :-----------------------------: | :---------------------------------------: |
|     C++     |       [libpq](cpp/libpq)        |       [README](cpp/libpq/README.md)       |
| C# (dotnet) |     [npgsql](dotnet/npgsql)     | [README](dotnet/npgsql/example/README.md) |
|    Java     |      [pgjdbc](java/pgjdbc)      |      [README](java/pgjdbc/README.md)      |
|     Go      |          [go](go/pgx/)          |        [README](go/pgx/README.md)         |
|   NodeJS    |  [nodejs](javascript/nodejs/)   |   [README](javascript/nodejs/README.md)   |
|   Python    |   [psycopg](python/psycopg/)    |    [README](python/psycopg/README.md)     |
|   Python    |  [psycopg2](python/psycopg2/)   |    [README](python/psycopg2/README.md)    |
|   Python    | [sqlalchemy](python/sqlalchemy) |   [README](python/sqlalchemy/README.md)   |
|    Ruby     |       [rails](ruby/rails)       |      [README](ruby/rails/README.md)       |
|    Ruby     |     [ruby-pg](ruby/ruby-pg)     |     [README](ruby/ruby-pg/README.md)      |
|    Rust     |        [sqlx](rust/sqlx)        |       [README](rust/sqlx/README.md)       |

Each example includes language and client-specific instructions as well as instructions to invoke example code.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This project is licensed under the MIT-0 License.
