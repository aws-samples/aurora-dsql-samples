# DBeaver guide

## Setup guide

[See here for instructions on using DBeaver with Amazon Distributed SQL.](https://alpha.www.docs.aws.a2z.com/distributed-sql/latest/userguide/accessing-sql-clients.html#accessing-sql-clients-dbeaver) 

## Limitations

### Unsupported DBeaver features

Many features supported by DBeaver are not supported by Amazon Distributed SQL. [See here for more information on unsupported features](TBD).

### DSQL errors in DBeaver

#### OC001 Schema update error

If you or another user are making changes to the schema of your DSQL cluster, you may come across concurrent schema modification errors, with the error message `ERROR: schema has been updated by another transaction, please retry: (OC001)`. If this happens simply retry the transaction or operation, and it should then succeed.

#### Alter table add or drop column

Modifying tables to add or drop columns with the DBeaver UI is not currently working, and results in an error like 
`ERROR: prepared statement "STMT_11" already exists` when adding columns. This is caused by the null default value when columns are created in the DBeaver.
There is a workaround by using the SQL editor to execute the statement `ALTER TABLE <table> ADD <column> <type>;`. 

Dropping columns in populated tables is not supported in DSQL.


#### Creating and deleting stored procedures

Creating and deleting stored procedures in DBeaver is not currently working, and results in an error `FATAL: prepared statement "" does not exist`. Executing functions still works as expected with limitations (PL/pgSQL is not supported for example). Supported procedures can still be created using psql and other tools.
