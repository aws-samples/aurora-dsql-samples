# Libpq with Aurora DSQL

## Table of Contents

1. Prerequisites
2. Execute Examples
   1. Connect to Cluster
   2. SQL CRUD Examples
      1. Create
      2. Read
      3. Update
      4. Delete

## Prerequisites

1. Provision a Aurora DSQL cluster by following the [user guide](TODO) if not already done.
   Note down the endpoint, you will need to establish a connection.
2. C++ compiler
    - We've tested with g++ (GCC) 7.3.1 on linux. An equivalent or a newer version should work as well.
3. AWS SDK for C++
    - It is required for database token generation
    - [Official site](https://docs.aws.amazon.com/sdk-for-cpp/v1/developer-guide/welcome.html)
    - The path to the AWS SDK libraries and include files will need to be specified for compilation.
    - The path to the AWS SDK libraries will need to be specified for execution
    - **Note**: The sufficient subset of the AWS SDK is provided with this sample
4. Libpq library and Postgres include files need to be present
    - The path to the Libpq library and include files will need to be specified for compilation.
    - The path to the Libpq library will need to be specified for execution
    - Obtaining Libpq library
      - It is installed with postgres installation. Therefore, if postgres is installed on the system the libpq is present in ../postgres_install_dir/lib, ../postgres_install_dir/include
      - It is installed when psql client program is installed, similarily as with postgres installation. 
      - On some systems libpq can be installed through package manager (if the package is exists for the system) e.g.
        ```
        sudo yum install libpq-devel
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
#include <aws/dsql/dsqlClient.h>
#include <iostream>

using namespace Aws;
using namespace Aws::dsql;
using namespace Aws::dsql::Model;

std::string generateDBAuthToken(const std::string endpoint, const std::string action, const std::string region) {
    Aws::SDKOptions options;
    Aws::InitAPI(options);
    dsqlClientConfiguration clientConfig;
    clientConfig.region = region;
    dsqlClient client{clientConfig};
    std::string token = "";
    
    // The token expiration time is optional, and the default value 900 seconds
    const auto presignedString = client.GenerateDBAuthToken(endpoint, region, action);
    if (presignedString.IsSuccess()) {
        token = presignedString.GetResult();
    } else {
        std::cerr << "Token Generation Failed." << std::endl;
    }

    Aws::ShutdownAPI(options);
    return token;
}

PGconn* connectToCluster(std::string clusterEndpoint, std::string region) {
    std::string action = "DbConnectAdmin";

    std::string password = generateDBAuthToken(clusterEndpoint, action, region);
    
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
        std::cerr << "Error while connecting to the database server: " <<  PQerrorMessage(conn) << std::endl;
        PQfinish(conn);
       return NULL;
    }

    return conn;
}
```

## SQL CRUD Examples


### 1. Create Owner Table

> [!Note]
>
> Note that Aurora DSQL does not support SERIAL, so id is based on uuid.

```cpp
#include <libpq-fe.h>
#include <iostream>

void createTables(PGconn *conn) {
    std::string query = "CREATE TABLE IF NOT EXISTS owner (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(30) NOT NULL, city VARCHAR(80) NOT NULL, telephone VARCHAR(20))";

    PGresult *res = PQexec(conn, query.c_str());
    ExecStatusType resStatus = PQresultStatus(res);
    PQclear(res);

    if (resStatus != PGRES_COMMAND_OK) {
        std::cerr << "Create Table failed - " << PQerrorMessage(conn) << std::endl;        
    }
}
```

### 2. Create Owner

```cpp
#include <libpq-fe.h>
#include <iostream>

void createOwner(PGconn *conn) {
    std::string query = "INSERT INTO owner(name, city, telephone) VALUES('John Doe', 'Vancouver', '555 555-5555')";

    PGresult *res = PQexec(conn, query.c_str());
    ExecStatusType resStatus = PQresultStatus(res);
    PQclear(res);
    
    if (resStatus != PGRES_COMMAND_OK) {
        std::cerr << "Insert failed - " << PQerrorMessage(conn) << std::endl;        
    }        
}
```

### 3. Read Owner

```cpp
#include <libpq-fe.h>
#include <iostream>

void readOwner(PGconn *conn) {
    std::string query = "SELECT * FROM owner";

    PGresult *res = PQexec(conn, query.c_str());
    ExecStatusType resStatus = PQresultStatus(res);

    if (resStatus != PGRES_TUPLES_OK) {
        std::cerr << "Select failed - " << PQerrorMessage(conn) << std::endl;
        PQclear(res);
        return;
    }

    // Retrieve the number of rows and columns in the result
    int rows = PQntuples(res);
    int cols = PQnfields(res);
    std::cout << "Number of rows: " << rows << std::endl;
    std::cout << "Number of columns: " << cols << std::endl;

    // Output the column names
    for (int i = 0; i < cols; i++) {
        std::cout << PQfname(res, i) << " \t\t\t ";
    }
    std::cout << std::endl;

    // Output all the rows and column values
    for (int i = 0; i < rows; i++) {
        for (int j = 0; j < cols; j++) {
            std::cout << PQgetvalue(res, i, j) << "\t";
        }
        std::cout << std::endl;
    }
    PQclear(res);
}
```

### 4. Update Owner

```cpp
#include <libpq-fe.h>
#include <iostream>

void updateOwner(PGconn *conn) {
    std::string query = "UPDATE owner SET telephone = '555-5555-1234' WHERE name = 'John Doe'";

    PGresult *res = PQexec(conn, query.c_str());
    ExecStatusType resStatus = PQresultStatus(res);
    PQclear(res);
    
    if (resStatus != PGRES_COMMAND_OK) {
        std::cerr << "Update failed - " << PQerrorMessage(conn) << std::endl;        
    }        
}
```

### 5. Delete Owner

```cpp
#include <libpq-fe.h>
#include <iostream>

void deleteOwner(PGconn *conn) {
    std::string query = "DELETE FROM owner WHERE name = 'John Doe'";
    PGresult *res = PQexec(conn, query.c_str());
    ExecStatusType resStatus = PQresultStatus(res);
    PQclear(res);
    
    if (resStatus != PGRES_COMMAND_OK) {
        std::cerr << "Delete failed - " << PQerrorMessage(conn) << std::endl;        
    }        
}
```

### Example program using the functionality

```cpp
#include <libpq-fe.h>
#include <aws/core/Aws.h>
#include <aws/dsql/dsqlClient.h>
#include <iostream>

using namespace Aws;
using namespace Aws::dsql;
using namespace Aws::dsql::Model;

void crud() {
    std::string region = "us-east-1";
    std::string clusterEndpoint = "abcdefghijklmnopqrst123456.dsql.us-east-1.on.aws";

    PGconn *conn = connectToCluster(clusterEndpoint, region);

    if (conn == NULL) {
        std::cerr << "Failed to get connection. Exiting." << std::endl;
        return;
    }
    createTables(conn);
    createOwner(conn);
    readOwner(conn);
    updateOwner(conn);
    readOwner(conn);
    deleteOwner(conn);
    readOwner(conn);
    disconnect(conn);
}

int main(int argc, char *argv[]) {
    crud();
    return 0;
}
```