package org.example;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;

import com.amazon.axdb.devtools.ConnectionUtil;

public class HelloCrud {

    private static String CLUSTER_ENDPOINT = "<your_cluster_endpoint>";
    private static final String REGION = "us-east-1";

    public static void main(String[] args) {

        try (Connection conn = ConnectionUtil.getConnection(CLUSTER_ENDPOINT, REGION)) {
            createTables(conn);
            createOwner(conn);
            readOwner(conn);
            updateOwner(conn);
            readOwner(conn);
            deleteOwner(conn);

        } catch (SQLException e) {
            e.printStackTrace();
        }
    }

    private static void createTables(Connection conn) throws SQLException {
        Statement st = conn.createStatement();
        st.executeUpdate("CREATE TABLE IF NOT EXISTS owner (id UUID PRIMARY KEY, name VARCHAR(255), city VARCHAR(255), telephone VARCHAR(255))");
        st.close();
    }

    private static void createOwner(Connection conn) {
        UUID uuid = UUID.randomUUID();
        String insertSql = String.format("INSERT INTO owner (id, name, city, telephone) VALUES ('%s', 'John Doe', 'Vancouver', '555 555-5555')", uuid);

        try {
            Statement st = conn.createStatement();
            st.executeUpdate(insertSql);
            st.close();
        } catch (SQLException e) {
            e.printStackTrace();
        }
    }

    private static void updateOwner(Connection conn) throws SQLException {
        String updateSQL = "UPDATE owner SET telephone = '555-5555-1234' WHERE name = 'John Doe'";
        Statement st = conn.createStatement();
        st.executeUpdate(updateSQL);
        st.close();
    }


    private static void readOwner(Connection conn) throws SQLException {
        String selectSQL = "SELECT * FROM owner";
        try (Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(selectSQL)) {
            while (rs.next()) {
                System.out.println("ID: " + rs.getString("id"));
                System.out.println("Name: " + rs.getString("name"));
                System.out.println("City: " + rs.getString("city"));
                System.out.println("Telephone: " + rs.getString("telephone"));
            }
        }
    }


    private static void deleteOwner(Connection conn) throws SQLException {
        Statement st = conn.createStatement();
        st.executeUpdate("DELETE FROM owner WHERE name = 'John Doe'");
    }


}
