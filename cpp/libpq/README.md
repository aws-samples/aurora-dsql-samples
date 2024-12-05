# Libpq with Aurora DSQL

## Table of Contents

1. Prerequisites
2. Example using libpq with Aurora DSQL

## Prerequisites

1. Provision a Aurora DSQL cluster by following the [user guide](TODO) if not already done.
   Note down the endpoint, you will need to establish a connection.
2. C++ compiler
    - We've tested with g++ (GCC) 7.3.1 on linux. An equivalent or a newer version should work as well
3. AWS SDK for C++
    - It is required for database token generation
    - [Official site](https://docs.aws.amazon.com/sdk-for-cpp/v1/developer-guide/welcome.html)
    - The path to the AWS SDK libraries and include files will need to be specified for compilation.
    - The path to the AWS SDK libraries will need to be specified for execution

    **Note**
    
    If you're building the SDK from source and you only need it for dsql you may use the -DBUILD_ONLY="dsql" flag to avoid building the entire sdk.
    For example:

    ```
    cmake ../aws-sdk-cpp -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH=/usr/local/ -DCMAKE_INSTALL_PREFIX=/usr/local/ -DBUILD_ONLY="dsql"
    ```
4. Libpq library and Postgres include files need to be present
    - The path to the Libpq library and include files will need to be specified for compilation
    - The path to the Libpq library will need to be specified for execution
    - Obtaining Libpq library
      - It is installed with postgres installation. Therefore, if postgres is installed on the system the libpq is present in ../postgres_install_dir/lib, ../postgres_install_dir/include
      - It is installed when psql client program is installed, similarily as with postgres installation. 
      - On some systems libpq can be installed through package manager (if the package is exists for the system) e.g.
        ```
        sudo yum install libpq-devel
        ```
      - On Mac libpq can be installed using brew
        ```
        brew install libpq
        ```
      - The [official website](https://www.postgresql.org/download/) may have a package for libpq or psql which bundles libpq
      - The last resort, build from source which also can be obtained from [official website](https://www.postgresql.org/ftp/source/) 
5. SSL Libraries
    - SSL libraries need to be installed
    - For example on Amazon Linux run these commands:
        ```
        sudo yum install -y openssl-devel 
        sudo yum install -y  openssl11-libs 
        ```
    - On many systems the SSL libraries can be installed using package managers
    - They can be downloaded from the [official website](https://openssl-library.org/source/index.html)

## Connect to Cluster

[!Important]
>
> To execute the example code, you need to have valid AWS Credentials configured (e.g. AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN)

```cpp
#include <libpq-fe.h>
#include <aws/core/Aws.h>
#include <aws/dsql/DSQLClient.h>
#include <iostream>

using namespace Aws;
using namespace Aws::DSQL;
using namespace Aws::DSQL::Model;

std::string generateDBAuthToken(const std::string endpoint, const std::string region) {
    Aws::SDKOptions options;
    Aws::InitAPI(options);
    DSQLClientConfiguration clientConfig;
    clientConfig.region = region;
    DSQLClient client{clientConfig};
    std::string token = "";
    
    // The token expiration time is optional, and the default value 900 seconds
    // If you are not using admin role to connect, use GenerateDBConnectAuthToken instead
    const auto presignedString = client.GenerateDBConnectAdminAuthToken(endpoint, region);
    if (presignedString.IsSuccess()) {
        token = presignedString.GetResult();
    } else {
        std::cerr << "Token generation failed." << std::endl;
    }

    Aws::ShutdownAPI(options);
    return token;
}

PGconn* connectToCluster(std::string clusterEndpoint, std::string region) {
    std::string password = generateDBAuthToken(clusterEndpoint, region);
    
    std::string dbname = "postgres";
    std::string user = "admin";
    std::string sslmode = "require";
    int port = 5432;

    if (password.empty()) {
        std::cerr << "Failed to generate token." << std::endl;
        return NULL;
    } 

    char conninfo[4096];
    sprintf(conninfo, "dbname=%s user=%s host=%s port=%i sslmode=%s password=%s", 
            dbname.c_str(), user.c_str(), clusterEndpoint.c_str(), port, sslmode.c_str(), password.c_str());

    PGconn *conn = PQconnectdb(conninfo);

    if (PQstatus(conn) != CONNECTION_OK) {
        std::cerr << "Error while connecting to the database server: " << PQerrorMessage(conn) << std::endl;
        PQfinish(conn);
       return NULL;
    }

    return conn;
}

void example(PGconn *conn) {

    // Create a table
    std::string create = "CREATE TABLE IF NOT EXISTS owner (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(30) NOT NULL, city VARCHAR(80) NOT NULL, telephone VARCHAR(20))";

    PGresult *createResponse = PQexec(conn, create.c_str());
    ExecStatusType createStatus = PQresultStatus(createResponse);
    PQclear(createResponse);

    if (createStatus != PGRES_COMMAND_OK) {
        std::cerr << "Create Table failed - " << PQerrorMessage(conn) << std::endl;        
    }
    
    // Insert data into the table
    std::string insert = "INSERT INTO owner(name, city, telephone) VALUES('John Doe', 'Anytown', '555-555-0150')";

    PGresult *insertResponse = PQexec(conn, insert.c_str());
    ExecStatusType insertStatus = PQresultStatus(insertResponse);
    PQclear(insertResponse);
    
    if (insertStatus != PGRES_COMMAND_OK) {
        std::cerr << "Insert failed - " << PQerrorMessage(conn) << std::endl;        
    }
    
    // Read the data we inserted
    std::string select = "SELECT * FROM owner";

    PGresult *selectResponse = PQexec(conn, select.c_str());
    ExecStatusType selectStatus = PQresultStatus(selectResponse);

    if (selectStatus != PGRES_TUPLES_OK) {
        std::cerr << "Select failed - " << PQerrorMessage(conn) << std::endl;
        PQclear(selectResponse);
        return;
    }

    // Retrieve the number of rows and columns in the result
    int rows = PQntuples(selectResponse);
    int cols = PQnfields(selectResponse);
    std::cout << "Number of rows: " << rows << std::endl;
    std::cout << "Number of columns: " << cols << std::endl;

    // Output the column names
    for (int i = 0; i < cols; i++) {
        std::cout << PQfname(selectResponse, i) << " \t\t\t ";
    }
    std::cout << std::endl;

    // Output all the rows and column values
    for (int i = 0; i < rows; i++) {
        for (int j = 0; j < cols; j++) {
            std::cout << PQgetvalue(selectResponse, i, j) << "\t";
        }
        std::cout << std::endl;
    }
    PQclear(selectResponse);
}

int main(int argc, char *argv[]) {
    std::string region = "us-east-1";
    // Please replace with your own cluster endpoint
    std::string clusterEndpoint = "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws";

    PGconn *conn = connectToCluster(clusterEndpoint, region);

    if (conn == NULL) {
        std::cerr << "Failed to get connection. Exiting." << std::endl;
        return -1;
    }
    
    example(conn);

    return 0;
}
```