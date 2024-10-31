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
   2. Transaction with retry example
   3. Client Connection Pool example
   4. Primary key generation example
3. Token Session Management

## Prerequisites

>
> TBD: Please remove it before launch. For Maven builds, please refer to the special instructions in Contributing.md.
>

### Create Cluster

You can access the AWS Management Console for Amazon DSQL at https://console.aws.amazon.com/dsql/home (TBD Update this link before launch)

    * 1. Login to console
    * 2. Create Cluster

        * Accept defaults, for example applications
        * Create Cluster

### Driver Dependencies

Postgresql JDBC Driver pre-requisites:

1. Java Development Kit (JDK): Ensure you have JDK 17+ installed. You can download it from the AWS Corretto or use OpenJDK.

   _To verify the java is installed, you can run_
   ```bash
   java -version
   ```

   It should output something similar to `java version "17.x"`.

2. Build Tool (Maven or Gradle)
   - _Maven_: Ensure Maven is installed if that is your preferred option. You can download it from the [official website](https://maven.apache.org/download.cgi).
   - _Gradle_: Ensure Gradle is installed if that is your preferred option. You can download it from the [official website](https://gradle.org/install/).
- AWS SDK: Ensure that you setup the latest version of the AWS Java SDK [official website](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/setup.html)


For example for pgJDBC:

### Obtaining the pgJDBC Driver for PostgreSQL

#### Direct Download
The PostgreSQL JDBC Driver can be installed from pre-compiled packages that can be downloaded directly from the PostgreSQL JDBC site or Maven Central. To install the driver, obtain the corresponding JAR file and include it in the application's CLASSPATH.


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
        props.setProperty("user", "axdb_superuser");
        props.setProperty("password", getPassword(cluster, region));
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
>
> To execute the example code, you need to have valid AWS Credentials configured (e.g. AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN)

The CRUD examples described below are all contained in `HelloCrud.java`

### Compile and Execute Example

### Update cluster name

Edit the `src/main/java/org/example/HelloCrud.java` (line 13) to modify the code to include your cluster id.

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

Add text to describe that Aurora DSQL requires that in order to handle OC001 error issue, the code logic needs to support transaction retries (Recommend example should be an example of the simple CRUD examples and extended to show transaction retries)

TODO Example of transaction retries - This section will be added later

