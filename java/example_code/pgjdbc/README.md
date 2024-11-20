# pgJDBC with Aurora DSQL

## Table of Contents

1. Prerequisites
2. Obtaining the pgJDBC Driver for PostgreSQL
3. Example using pgJDBC with Aurora DSQL

## Prerequisites

1. Provision a Aurora DSQL cluster by following the [user guide](TODO) if not already done.
   Note down the endpoint, you will need to establish a connection.
2. Java Development Kit (JDK): Ensure you have JDK 17+ installed. You can download it from the AWS Corretto or use OpenJDK.

   _To verify the java is installed, you can run_
   ```bash
   java -version
   ```

   It should output something similar to `java version "17.x"`. (you version could be different)

3. Build Tool (Maven or Gradle)
   - _Maven_: Ensure Maven is installed if that is your preferred option. You can download it from the [official website](https://maven.apache.org/download.cgi).
   - _Gradle_: Ensure Gradle is installed if that is your preferred option. You can download it from the [official website](https://gradle.org/install/).
- AWS SDK: Ensure that you setup the latest version of the AWS Java SDK [official website](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/setup.html)


For example for pgJDBC:

## Obtaining the pgJDBC Driver for PostgreSQL


### As a Maven Dependency
You can use Maven's dependency management to obtain the driver by adding the following configuration in the application's Project Object Model (POM) file:


```xml
<dependencies>
  <dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <version>LATEST</version>
  </dependency>
</dependencies>
```

### As a Gradle Dependency
You can use Gradle's dependency management to obtain the driver by adding the following configuration in the application's build.gradle file:


```
dependencies {
  implementation 'org.postgresql:postgresql:x.y.z'
}
```

## Example using pgJDBC with Aurora DSQL

``` java
package org.example;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.services.dsql.DsqlUtilities;
import software.amazon.awssdk.regions.Region;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Duration;
import java.util.Properties;
import java.util.UUID;

public class Example {

    // Get a connection to Aurora DSQL.
    public static Connection getConnection(String cluster, String region) throws SQLException {

        Properties props = new Properties();

        // Use the DefaultJavaSSLFactory so that Java's default trust store can be used
        // to verify the server's root cert.
        String url = "jdbc:postgresql://" + cluster + ":5432/postgres?sslmode=verify-full&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory";

        DsqlUtilities utilities = DsqlUtilities.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();

        // The token expiration time is optional, and the default value 900 seconds
        // If you are not using admin role use generateDbConnectAuthToken instead
        String password = utilities.generateDbConnectAdminAuthToken(builder -> builder.hostname(cluster)
                .region(Region.of(region)));

        props.setProperty("user", "admin");
        props.setProperty("password", password);
        return DriverManager.getConnection(url, props);

    }

    public static void main(String[] args) {
        // Please replace with your own cluster endpoint
        String cluster_endpoint = "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws";
        String region = "us-east-1";
        try (Connection conn = Example.getConnection(cluster_endpoint, region)) {

            // Create a new table named owner
            Statement create = conn.createStatement();
            create.executeUpdate("CREATE TABLE IF NOT EXISTS owner (id UUID PRIMARY KEY, name VARCHAR(255), city VARCHAR(255), telephone VARCHAR(255))");
            create.close();

            // Insert some data
            UUID uuid = UUID.randomUUID();
            String insertSql = String.format("INSERT INTO owner (id, name, city, telephone) VALUES ('%s', 'John Doe', 'Anytown', '555-555-0150')", uuid);
            Statement insert = conn.createStatement();
            insert.executeUpdate(insertSql);
            insert.close();

            // Read back the data and assert they are present
            String selectSQL = "SELECT * FROM owner";
            Statement read = conn.createStatement();
            ResultSet rs = read.executeQuery(selectSQL);
            while (rs.next()) {
                assert rs.getString("id") != null;
                assert rs.getString("name").equals("John Doe");
                assert rs.getString("city").equals("Anytown");
                assert rs.getString("telephone").equals("555-555-0150");
            }
        } catch (SQLException e) {
            e.printStackTrace();
        }
    }
}
```
