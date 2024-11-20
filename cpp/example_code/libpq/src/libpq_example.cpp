#include <libpq-fe.h>
#include <aws/core/Aws.h>
#include <aws/axdbfrontend/AxdbFrontendClient.h>
#include <iostream>

using namespace Aws;
using namespace Aws::AxdbFrontend;
using namespace Aws::AxdbFrontend::Model;

std::string generateDBAuthToken(const std::string endpoint, const std::string action, const std::string region) {
    Aws::SDKOptions options;
    Aws::InitAPI(options);
    AxdbFrontendClientConfiguration clientConfig;
    clientConfig.region = region;
    AxdbFrontendClient client{clientConfig};
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

void disconnect(PGconn *conn ) {
    std::cout << "disconnecting ..." << std::endl;
    if (conn != NULL) {
        PQfinish(conn);
    }
}

PGconn* connectToCluster(std::string clusterEndpoint, std::string region) {
    std::string action = "DbConnectSuperuser";

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

    std::cout << std::endl << "Connection Established: " << std::endl;
    std::cout << "Port: " << PQport(conn) << std::endl;
    std::cout << "Host: " << PQhost(conn) << std::endl;
    std::cout << "DBName: " << PQdb(conn) << std::endl;

    return conn;
}

void createTables(PGconn *conn) {
    std::string query = "CREATE TABLE IF NOT EXISTS owner (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(30) NOT NULL, city VARCHAR(80) NOT NULL, telephone VARCHAR(20))";

    PGresult *res = PQexec(conn, query.c_str());
    ExecStatusType resStatus = PQresultStatus(res);
    PQclear(res);

    if (resStatus != PGRES_COMMAND_OK) {
        std::cerr << "Create Table failed - " << PQerrorMessage(conn) << std::endl;        
    }
}

void createOwner(PGconn *conn) {
    std::string query = "INSERT INTO owner(name, city, telephone) VALUES('John Doe', 'Anytown', '555-555-0150')";

    PGresult *res = PQexec(conn, query.c_str());
    ExecStatusType resStatus = PQresultStatus(res);
    PQclear(res);
    
    if (resStatus != PGRES_COMMAND_OK) {
        std::cerr << "Insert failed - " << PQerrorMessage(conn) << std::endl;        
    }        
}

void updateOwner(PGconn *conn) {
    std::string query = "UPDATE owner SET telephone = '555-5555-1234' WHERE name = 'John Doe'";

    PGresult *res = PQexec(conn, query.c_str());
    ExecStatusType resStatus = PQresultStatus(res);
    PQclear(res);
    
    if (resStatus != PGRES_COMMAND_OK) {
        std::cerr << "Update failed - " << PQerrorMessage(conn) << std::endl;        
    }        
}

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

void deleteOwner(PGconn *conn) {
    std::string query = "DELETE FROM owner WHERE name = 'John Doe'";
    PGresult *res = PQexec(conn, query.c_str());
    ExecStatusType resStatus = PQresultStatus(res);
    PQclear(res);
    
    if (resStatus != PGRES_COMMAND_OK) {
        std::cerr << "Delete failed - " << PQerrorMessage(conn) << std::endl;        
    }        
}

void crud() {
    std::string region = "us-east-1";
    std::string clusterEndpoint = "4iabtthnplobb4p5pb23eahuiq.c0001.us-east-1.prod.sql.axdb.aws.dev";

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

