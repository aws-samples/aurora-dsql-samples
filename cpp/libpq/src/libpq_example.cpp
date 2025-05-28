#include <libpq-fe.h>
#include <aws/core/Aws.h>
#include <aws/dsql/DSQLClient.h>
#include <cstdlib>
#include <iostream>

using namespace Aws;
using namespace Aws::DSQL;
using namespace Aws::DSQL::Model;

std::string generateDBAuthToken(const std::string clusterUser, const std::string clusterEndpoint, const std::string region) {
    Aws::SDKOptions options;
    Aws::InitAPI(options);
    DSQLClientConfiguration clientConfig;
    clientConfig.region = region;
    DSQLClient client{clientConfig};
    std::string token = "";
    
    // The token expiration time is optional, and the default value 900 seconds
    const auto presignedString = clusterUser == "admin" ? client.GenerateDBConnectAdminAuthToken(clusterEndpoint, region) : 
                                                          client.GenerateDBConnectAuthToken(clusterEndpoint, region);
    
    if (presignedString.IsSuccess()) {
        token = presignedString.GetResult();
    } else {
        std::cerr << "Token generation failed." << std::endl;
    }

    Aws::ShutdownAPI(options);
    return token;
}

PGconn* connectToCluster(std::string clusterUser, std::string clusterEndpoint, std::string region) {
    std::string dbname = "postgres";
    std::string sslrootcert = "./root.pem";
    std::string sslmode = "verify-full";
    std::string sslnegotiation = "direct";
    int port = 5432;

    // Generate a fresh password token for each connection, to ensure the token is not expired
    // when the connection is established
    std::string password_token = generateDBAuthToken(clusterUser, clusterEndpoint, region);

    if (password_token.empty()) {
        std::cerr << "Failed to generate token." << std::endl;
        return NULL;
    } 

    char conninfo[4096];
    sprintf(conninfo,
            "dbname=%s user=%s host=%s port=%i sslrootcert=%s sslmode=%s sslnegotiation=%s password=%s",
            dbname.c_str(),
            clusterUser.c_str(),
            clusterEndpoint.c_str(),
            port,
            sslrootcert.c_str(),
            sslmode.c_str(),
            sslnegotiation.c_str(),
            password_token.c_str());

    PGconn *conn = PQconnectdb(conninfo);

    if (PQstatus(conn) != CONNECTION_OK) {
        std::cerr << "Error while connecting to the database server: " << PQerrorMessage(conn) << std::endl;
        PQfinish(conn);
        return NULL;
    }

    std::cout << std::endl << "Connection Established: " << std::endl;
    std::cout << "Port: " << PQport(conn) << std::endl;
    std::cout << "DBName: " << PQdb(conn) << std::endl;

    if (clusterUser != "admin")
    {
        PGresult *result = PQexec(conn, "SET search_path = myschema");
        PQclear(result);
    }

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
    std::string select = "SELECT * FROM owner where name='John Doe'";

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
        if (rows == 0) {
            std::cerr << "No rows returned" << std::endl;
            retVal = -1;
        }
    }
    else {
        std::cerr << "Select failed - " << PQerrorMessage(conn) << std::endl;
        retVal = -1;
    }
    PQclear(selectResponse);

    PGresult *clearResponse = PQexec(conn, "DELETE FROM owner where name='John Doe'");
    PQclear(clearResponse);


    return retVal;
}

int main(int argc, char *argv[]) {
    std::string region = "";
    std::string clusterEndpoint = "";
    std::string clusterUser = "";

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
    if (const char* env_var = std::getenv("CLUSTER_USER")) {
        clusterUser = env_var;
    } else {
        std::cout << "Please set the CLUSTER_USER environment variable" << std::endl;
        return -1;
    }

    int testStatus = 0;

    PGconn *conn = connectToCluster(clusterUser, clusterEndpoint, region);

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

