# Improving Planning - Aurora DSQL Re:Invent PGJDBC Driver HowTos Launch (DRAFT)

## Table of Contents

1. Prerequisites
   1. Create Cluster
   2. Driver Dependencies
   3. Install Driver

2. Execute Examples
   1. SQL CRUD Examples
      1. Create
      2. Read
      3. Update
      4. Delete
   2. Transaction with retries example
   3. Client Connection Pool example
   4. Primary key generation example
3. Token Session Management

## Prerequisites

>
> TBD: Please remove before launch. Please refer to special instructions in Contributing.md for maven builds.
> 

### Create Cluster

You can access the AWS Management Console for Amazon DSQL at https://console.aws.amazon.com/dsql/home (TBD Update this link before launch)

    * 1. Login to console
    * 2. Create Cluster

        * Accept defaults for example applications
        * Create Cluster

### Driver Dependencies

PGJDBC Sample pre-requisites please update with specific pre-requisite installation instructions for your language technology assume customer does not have dependencies installed.
Java Development Kit (JDK): Ensure you have JDK 17+ installed. You can download it from the AWS Corretto or use OpenJDK.

Verify install
```bash
java -version
```

It should output something similar to `java version "17.x"`.

Build Tool (Maven or Gradle)
Maven: Ensure Maven is installed if that is your preferred option. You can download it from the [official website](https://maven.apache.org/download.cgi).
Gradle: Ensure Gradle is installed if that is your preferred option. You can download it from the [official website](https://gradle.org/install/).

### Install DSQL Connection

- Detail required instructions for installing the language specific token generation jar
  - TBD as we currently don’t have the details of where the customer can obtain the jar to add to Maven or Gradle

For example for pgJDBC:

### Obtaining the pgJDBC Driver for PostgreSQL

#### Direct Download
The PGJDBC Driver for PostgreSQL can be installed from pre-compiled packages that can be downloaded directly from PostgreSQL JDBC site or Maven Central. To install the driver, obtain the corresponding JAR file and include it in the application's CLASSPATH.


Example - Direct Download via wget

``` bash
wget https://jdbc.postgresql.org/download/postgresql-42.7.3.jar
```


Example - Adding the Driver to the CLASSPATH

``` bash
export CLASSPATH=$CLASSPATH:/home/userx/libs/postgresql-42.7.3.jar
```


#### As a Maven Dependency
You can use Maven's dependency management to obtain the driver by adding the following configuration in the application's Project Object Model (POM) file:
Example - Maven

```xml
<dependencies>
  <dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <version>LATEST</version>
  </dependency>
</dependencies>
```

#### As a Gradle Dependency
You can use Gradle's dependency management to obtain the driver by adding the following configuration in the application's build.gradle file:
Example - Gradle

```
dependencies {
  implementation 'org.postgresql:postgresql:x.y.z'
}
```

### Connect to Cluster

Via Java

``` java
package com.amazon.axdb.devtools;

import com.amazon.axdb.AxdbGenerateToken;

import java.net.URISyntaxException;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Optional;
import java.util.Properties;

public class ConnectionUtil {

    public static Connection getConnection(String cluster, String region) throws SQLException {

        Properties props = new Properties();

        String url = "jdbc:postgresql://" + cluster + ":5432/postgres";
        if (!props.containsKey("user")) {
            props.setProperty("user", "axdb_superuser");
        }
        if (!props.containsKey("password")) {
            props.setProperty("password", getPassword(cluster, region));
        }
        return DriverManager.getConnection(url, props);

    }

    private static String getPassword(String host, String region) {
        AxdbGenerateToken generator = AxdbGenerateToken.builder(host, region)
                .expiresInSecs(600L) // Set token expiry duration (optional)
                .build();

        try {
            return Optional.of(generator.generateSuperuserToken()).get();
        } catch (URISyntaxException use) {
            System.out.println("Unable to generate token " + use.getMessage());
            return "UNKNOWN";
        }
    }

}
```

## SQL CRUD Examples

> [!Important]
> To execute example code requires that you have AWS Credentials (eg AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN)

The CRUD examples described below are all contained in `HelloCrud.java`

### Compile and Execute Example

### Update cluster name

Edit the `src/main/java/org/example/HelloCrud.java` (line 13) to add modify code to include your cluster id

#### Maven

```
mvn clean compile assembly:single
java -jar target/helloDSQL-1.0-SNAPSHOT-jar-with-dependencies.jar
```

#### Gradle

```
./gradlew run
```

### 1. Create Owner Tables

> [!Note] 
> Note that DSQL does not support SERIAL so id is based on uuid see (suggest best practice guide on this)

```java
    private static void createTables(Connection conn) throws SQLException {
        Statement st = conn.createStatement();
        st.executeUpdate("CREATE TABLE IF NOT EXISTS owner (id UUID PRIMARY KEY, name VARCHAR(255), city VARCHAR(255), telephone VARCHAR(255))");
        st.close();
    }
```

### 2. Create Owner

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

### 3. Read Owner

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

### 4. Update Owner

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

### 5. Delete Owner

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

## [TBD] Transaction with retries example

Add text to describe that Aurora DSQL requires that in order to handle OC001 error issue the code logic needs to support a transaction retries (Recommend example should be example of the simple CRUD examples and extended to show transaction retries)

TODO Example of transaction retries - This section will be added later

## Token Session Management

As Aurora DSQL connection tokens have expiration, we need to define a token expiration handling strategy utilized by sample code (if supported).

IAM credentials must be available at each time a token is generated, otherwise an invalid token will be created. (TBD - let's verify that this is still case with 2.0 version)

The password tokens generated have an expiration time. This is configurable by setting the parameter `--expires-in-secs=<expiration time>`. After the expiration time has passed, connection attempts with this token will be rejected. This expiration applies to new connections, so after a connection is created with a valid token, the connection can remain active, but new connections will fail if the token is expired.

Long-running applications will, therefore, need a strategy to handle token expiration, as new tokens will have to be periodically generated. Possible strategies to handle token expiration include incorporating the token generator into the application so that new tokens are created as new connections are made or creating some additional Lambda process to refresh tokens by updating a password value in AWS Secrets Manager. The ideal strategy will depend on your use case.

