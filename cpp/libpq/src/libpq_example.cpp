#include <libpq-fe.h>
#include <aws/core/Aws.h>
#include <aws/dsql/DSQLClient.h>
#include <cstdlib>
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
    // If you aren not using admin role to connect, use GenerateDBConnectAuthToken instead
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

    std::cout << std::endl << "Connection Established: " << std::endl;
    std::cout << "Port: " << PQport(conn) << std::endl;
    // std::cout << "Host: " << PQhost(conn) << std::endl;
    std::cout << "DBName: " << PQdb(conn) << std::endl;

    return conn;
}

int example(PGconn *conn) {

    int retVal = 0;

    // Create a table
    std::string create = "CREATE TABLE IF NOT EXISTS owner (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(30) NOT NULL, city VARCHAR(80) NOT NULL, telephone VARCHAR(20))";

    PGresult *createResponse = PQexec(conn, create.c_str());
    ExecStatusType createStatus = PQresultStatus(createResponse);
    PQclear(createResponse);

    if (createStatus != PGRES_COMMAND_OK) {
        std::cerr << "Create Table failed - " << PQerrorMessage(conn) << std::endl;
        retVal = -1;        
    }
    
    // Insert data into the table
    std::string insert = "INSERT INTO owner(name, city, telephone) VALUES('John Doe', 'Anytown', '555-555-1999')";

    PGresult *insertResponse = PQexec(conn, insert.c_str());
    ExecStatusType insertStatus = PQresultStatus(insertResponse);
    PQclear(insertResponse);
    
    if (insertStatus != PGRES_COMMAND_OK) {
        std::cerr << "Insert failed - " << PQerrorMessage(conn) << std::endl;    
        retVal = -1;    
    }
    
    // Read the data we inserted
    std::string select = "SELECT * FROM owner";

    PGresult *selectResponse = PQexec(conn, select.c_str());
    ExecStatusType selectStatus = PQresultStatus(selectResponse);

    if (selectStatus == PGRES_TUPLES_OK) {
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
    }
    else {
        std::cerr << "Select failed - " << PQerrorMessage(conn) << std::endl;
        retVal = -1;
    }
    PQclear(selectResponse);

    return retVal;
}

int main(int argc, char *argv[]) {
    std::string region = "";
    std::string clusterEndpoint = "";

    if (const char* env_var = std::getenv("CLUSTER_ENDPOINT")) {
        clusterEndpoint = env_var;
    } else {
        std::cout << "Please set the CLUSTER_ENDPOINT environment variable" << std::endl;
        return -1;
    }
    if (const char* env_var = std::getenv("REGION")) {
        region = env_var;
    } else {
        std::cout << "Please set the REGION environment variable" << std::endl;
        return -1;
    }

    int testStatus = 0;

    PGconn *conn = connectToCluster(clusterEndpoint, region);

    if (conn == NULL) {
        std::cerr << "Failed to get connection." << std::endl;
        testStatus = -1;
    } else {
        testStatus = example(conn);
    }
    
    if (testStatus == 0) {
        std::cout << "Libpq test passed" << std::endl;
    } else {
        std::cout << "Libpq test failed" << std::endl;
    }

    return testStatus;
}

