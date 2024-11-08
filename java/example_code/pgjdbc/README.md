# pgJDBC with Aurora DSQL

## Table of Contents

1. Prerequisites
2. Obtaining the pgJDBC Driver for PostgreSQL
3. Connect to Cluster
2. Execute Examples
   1. SQL CRUD Examples
      1. Create Owner Table
      2. Create Owner
      3. Read Owner
      4. Update Owner
      5. Delete Owner

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

## Connect to Cluster

Via Java

``` java
package com.amazon.dsql.devtools;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.services.axdbfrontend.AxdbFrontendUtilities;
import software.amazon.awssdk.services.axdbfrontend.model.Action;
import software.amazon.awssdk.regions.Region;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.Duration;
import java.util.Properties;

public class ConnectionUtil {

    public static final String ADMIN = "admin";
    public static final String OPTIONS = "options";

    public static Connection getConnection(String cluster, String region) throws SQLException {

        Properties props = new Properties();

        String url = "jdbc:postgresql://" + cluster + ":5432/postgres";
        props.setProperty("user", ADMIN);
        props.setProperty("password", getPassword(cluster, region));
        // TBD: need to remove pooler from code when pooler becomes the default
        props.setProperty(OPTIONS, "axdb_opts=pooler=true");
        return DriverManager.getConnection(url,
                props);

    }

    private static String getPassword(String host, String regionName) {
        Action action = Action.DB_CONNECT_SUPERUSER;

        AxdbFrontendUtilities utilities = AxdbFrontendUtilities.builder()
                .region(Region.of(regionName))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();

        return utilities.generateAuthenticationToken(builder -> builder.hostname(host)
                .action(action)
                .region(Region.of(regionName)));
    }
```

## Execute Examples

### SQL CRUD Examples

> [!Important]
>
> To execute the example code, you need to have valid AWS Credentials configured (e.g. AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN)

#### 1. Create Owner Table

> **Note**
>
> Note that Aurora DSQL does not support SERIAL, so id is based on uuid (suggest best practice guide on this TBD: Update link)

```java
    private static void createTables(Connection conn) throws SQLException {
        Statement st = conn.createStatement();
        st.executeUpdate("CREATE TABLE IF NOT EXISTS owner (id UUID PRIMARY KEY, name VARCHAR(255), city VARCHAR(255), telephone VARCHAR(255))");
        st.close();
    }
```

#### 2. Create Owner

``` java 
package org.example;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;

public class HelloCrud {
...

    public static void createOwner(Connection conn) {
        UUID uuid = UUID.randomUUID();
        String insertSql = String.format("INSERT INTO owner (id, name, city, telephone) VALUES ('%s', 'John Doe', 'Vancouver', '555 555-5555')", uuid);

        try {
            Statement st = conn.createStatement();
            int rs = st.executeUpdate(insertSql);
            st.close();
            System.out.println("Owner created successfully.");
        } catch (SQLException e) {
            e.printStackTrace();
        }
    }

...
}
```

#### 3. Read Owner

``` java
package org.example;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;

public class HelloCrud {
...


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

}
```

#### 4. Update Owner

``` java
package org.example;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;

public class HelloCrud {
...


    private static void updateOwner(Connection conn) throws SQLException {
        String updateSQL = "UPDATE owner SET telephone = '555-5555-1234' WHERE name = 'John Doe'";
        Statement st = conn.createStatement();
        int rs = st.executeUpdate(updateSQL);
        st.close();
    }

}
```

#### 5. Delete Owner

``` java
package org.example;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;

public class HelloCrud {
...


    private static void deleteOwner(Connection conn) throws SQLException {
        String deleteSQL = "DELETE FROM owner WHERE name = ?";
        Statement st = conn.createStatement();
        st.executeUpdate("DELETE FROM owner WHERE name = 'John Doe'");
    }
}
```
