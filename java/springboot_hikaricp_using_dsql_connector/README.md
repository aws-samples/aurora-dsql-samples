# Aurora DSQL JDBC Connector with Spring Boot and HikariCP Example

## Overview

This example demonstrates how to integrate Aurora DSQL with Spring Boot using HikariCP connection pooling and the **Aurora DSQL JDBC Connector**. This combination provides:

- **Spring Boot Integration**: Seamless configuration through application properties
- **Connection Pooling**: HikariCP manages database connections efficiently
- **Automatic IAM Authentication**: Aurora DSQL JDBC Connector handles IAM token generation

## Tutorial: Getting started with Spring Boot, Hikari, and the Aurora DSQL JDBC Connector

In this tutorial, you will set up a Spring Boot application using Hikari and the Aurora DSQL JDBC Connector.

> Note: this tutorial was written using the following technologies:
>    - Spring Boot 2.7.0
>    - Aurora DSQL JDBC Connector 1.0.0
>    - PostgreSQL 42.7.7
>    - Java 17


## Step 1: Create a Gradle Project
Create a Gradle Project with the following project hierarchy:
```
├───gradle
│   └───connector
│       ├───gradle-connector.jar
│       └───gradle-connector.properties   
├───build.gradle.kts
├───gradlew
└───src
    └───main
        ├───java
        │   └───software
        │       └───amazon
        │           └───SpringBootHikariExample
        │               ├───SpringBootHikariExampleApplication.java
        │               └───ApiController.java
        └───resources
            └───application.yml
```
When creating the `SpringBootHikariExampleApplication.java` class, add the following code to it.

```java
package software.amazon.SpringBootHikariExample;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class SpringBootHikariExampleApplication {
  public static void main(String[] args) {
    SpringApplication.run(SpringBootHikariExampleApplication.class, args);
  }
}
```
You may also use the Spring Initializr to create the boilerplate code:
1. Go to https://start.spring.io/
2. Select the Gradle project and version 2.7.0 of the Spring Boot.
3. Select Java version 17.
4. Click Dependencies and select the following:
    - Spring Web
    - Spring Data JDBC
    - PostgreSQL Driver

## Step 2: Add the required Gradle Dependencies

In the `build.gradle.kts` file, add the following dependencies.

```kotlin
dependencies {
	implementation("org.springframework.boot:spring-boot-starter-data-jdbc")
	implementation("org.springframework.boot:spring-boot-starter-web")
	implementation("software.amazon.dsql:aurora-dsql-jdbc-connector:1.0.0")
	implementation("org.postgresql:postgresql:42.7.7")
}
```

Please note that the sample code inside the Aurora DSQL JDBC Connector project will use the dependency `implementation(project(":aurora-dsql-jdbc-connector"))` instead of `implementation("software.amazon.dsql:aurora-dsql-jdbc-connector:1.0.0")` as seen above.

## Step 3: Configure the Datasource

In the `application.yml` file, configure Hikari and Aurora DSQL JDBC Connector as its driver.

```yaml
spring:
  datasource:
    url: jdbc:postgresql://your-cluster.dsql.us-east-1.on.aws/postgres
    username: admin
    driver-class-name: software.amazon.dsql.jdbc.AuroraDsqlDriver
    hikari:
      data-source-properties:
        token-duration-secs: 28800
        region: us-east-1
      max-lifetime: 3000000        # 50 minutes (shorter than Aurora DSQL's 60-minute limit)
      minimum-idle: 2
      maximum-pool-size: 10
      idle-timeout: 300000         # 5 minutes
      connection-timeout: 30000    # 30 seconds
      validation-timeout: 5000     # 5 seconds
      connection-test-query: "SELECT 1"
```

### Alternative DSQL-Style URL Configuration

```yaml
spring:
  datasource:
    url: your-cluster.dsql.us-east-1.on.aws/postgres
    username: admin
    driver-class-name: software.amazon.dsql.jdbc.AuroraDsqlDriver
    hikari:
      data-source-properties:
        token-duration-secs: 28800  # 8 hours
      max-lifetime: 3000000        # 50 minutes (shorter than Aurora DSQL's 60-minute limit)
      minimum-idle: 2
      maximum-pool-size: 10
      idle-timeout: 300000         # 5 minutes
      connection-timeout: 30000    # 30 seconds
      validation-timeout: 5000     # 5 seconds
      connection-test-query: "SELECT 1"
```

Note that in Spring Boot 2 and 3, Hikari is the default DataSource implementation. So, a bean explicitly specifying Hikari as a Datasource is not needed.

## Step 4: Create a REST Controller

Create an `ApiController.java` class to test the database connection:

```java
package software.amazon.SpringBootHikariExample;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
public class ApiController {

  @Autowired
  private JdbcTemplate jdbcTemplate;

  @GetMapping(value = "/select1")
  public Integer getOne() {
    return jdbcTemplate.queryForObject("SELECT 1", Integer.class);
  }

  @GetMapping(value = "/database-info")
  public Map<String, Object> getDatabaseInfo() {
    return jdbcTemplate.queryForMap(
      "SELECT current_user as user, current_database() as database, version() as version"
    );
  }

  @GetMapping(value = "/current-time")
  public Map<String, Object> getCurrentTime() {
    return jdbcTemplate.queryForMap("SELECT current_timestamp as current_time");
  }

  @GetMapping(value = "/health")
  public Map<String, Object> getHealth() {
    return jdbcTemplate.queryForMap("SELECT 'Aurora DSQL Connection OK' as status, current_timestamp as timestamp");
  }
}
```

## Step 5: Set Environment Variables

Set the following environment variables for your cluster details:

```bash
# Required: Aurora DSQL cluster endpoint
export CLUSTER_ENDPOINT="your-cluster.dsql.us-east-1.on.aws"

# Required: Aurora DSQL cluster user (e.g., "admin")
export CLUSTER_USER="admin"

# Optional: AWS profile name for custom credentials
export PROFILE="your-aws-profile"
```

## Step 6: Run the Application

# Optional: AWS profile for credentials
export PROFILE="<your-aws-profile>"

```bash
# Build the project
./gradlew build

# Run the application
./gradlew bootRun
```

**Test the endpoints:**
```bash
# Test basic query
curl http://localhost:8080/select1

# Get database information
curl http://localhost:8080/database-info

# Get current timestamp
curl http://localhost:8080/current-time

# Health check
curl http://localhost:8080/health
```

**Expected responses:**
- `/select1`: Returns `1`
- `/database-info`: Returns user, database name, and PostgreSQL version
- `/current-time`: Returns current timestamp from Aurora DSQL
- `/health`: Returns connection status and timestamp

## Troubleshooting

**Common Issues:**

1. **Authentication Errors**: Ensure AWS credentials are properly configured
2. **Connection Timeouts**: Verify Aurora DSQL cluster is active and accessible
3. **Permission Denied**: Check IAM permissions for Aurora DSQL access

**Logging:**
Enable debug logging by adding to `application.yml`:
```yaml
logging:
  level:
    software.amazon.dsql: DEBUG
```
