# Building a Spring Boot REST API with Amazon Aurora DSQL

Level 300 | Estimated reading time: 15 minutes | Estimated deployment time: 30 minutes

## Introduction

Building globally distributed applications that require low latency writes across multiple AWS Regions has traditionally meant choosing between consistency and availability. Teams often face the operational burden of managing database replication, handling failover, and coordinating writes across regions, all while keeping their application code simple.

Amazon Aurora DSQL is a serverless, distributed SQL database that provides active-active writes across multiple AWS Regions with strong consistency. It offers PostgreSQL compatibility, so you can use familiar tools and drivers without learning a new query language.

In this post, we walk you through building a Spring Boot REST API that integrates with Aurora DSQL. You'll learn how to configure the [Aurora DSQL JDBC Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/java/jdbc) for seamless IAM authentication and implement optimistic concurrency control — patterns that are essential for building reliable applications on Aurora DSQL.

## Overview

This post is intended for developers and solutions architects who are familiar with Java, Spring Boot, and relational databases. By the end of this walkthrough, you'll have a working REST API that demonstrates the following:

- Setting up Aurora DSQL with the Aurora DSQL JDBC Connector
- Handling optimistic concurrency control with retry logic
- Building a RESTful product inventory API using Spring Boot

## Solution overview

Traditional databases often struggle with global distribution and active-active writes. Aurora DSQL addresses these challenges by providing:

- **Serverless architecture** – No infrastructure to manage
- **Active-active writes** – Write to any Region simultaneously
- **PostgreSQL compatibility** – Use familiar tools and drivers
- **Built-in high availability** – Automatic failover and replication

The following diagram illustrates the architecture of the sample application.

![Architecture Diagram](image.png)

*Figure 1: Spring Boot application connecting to Amazon Aurora DSQL with the Aurora DSQL JDBC Connector, and HikariCP connection pooling.*

The application uses the following components:

- **Spring Boot 3.3** – REST API framework
- **HikariCP** – Connection pooling
- **Aurora DSQL JDBC Connector** – IAM authentication, token refresh, TLS encryption, and database connectivity

## Prerequisites

Before you begin, make sure you have the following:

- An AWS account with an Aurora DSQL cluster created (check the [Aurora DSQL documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/) for current region availability)
- AWS CLI configured with credentials
- Java 17 or higher installed
- Maven 3.6 or higher installed
- An IAM user or role with the minimum permissions shown below

IAM Policy (minimum permissions):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["dsql:DbConnectAdmin"],
      "Resource": "arn:aws:dsql:<region>:<account-id>:cluster/<cluster-id>"
    }
  ]
}
```

> ⚠️ Replace `<region>`, `<account-id>`, and `<cluster-id>` with your actual values. For production workloads, follow the principle of least privilege and scope permissions to specific clusters.

## Walkthrough

### Step 1: Create your Aurora DSQL cluster

1. Navigate to the [Aurora DSQL console](https://console.aws.amazon.com/dsql).
2. Choose **Create cluster**.
3. Choose your Region configuration (single-Region or multi-Region).
4. Enter a name for your cluster. Cluster settings are optional to configure.
5. Note your cluster endpoint after the cluster is ready.

### Step 2: Set up the project

Clone the sample repository:

```bash
git clone https://github.com/aws-samples/sample-spring-boot-aurora-dsql
cd sample-spring-boot-aurora-dsql
```

Update `src/main/resources/application.properties` with your DSQL endpoint:

```properties
# The Aurora DSQL JDBC Connector handles IAM auth, token refresh, and SSL automatically
spring.datasource.url=jdbc:aws-dsql:postgresql://<your-endpoint>.dsql.<region>.on.aws
spring.datasource.driver-class-name=software.amazon.dsql.jdbc.DSQLConnector

# IAM user or role name for authentication
spring.datasource.username=<username>

# AWS Region where your DSQL cluster is deployed
spring.cloud.aws.region.static=<region>
```

The application uses the [Aurora DSQL JDBC Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/java/jdbc) which automatically handles IAM authentication, token refresh, and TLS encryption.

### Step 3: Handle optimistic concurrency

Aurora DSQL uses optimistic concurrency control instead of traditional locking. Optimistic concurrency control allows multiple transactions to proceed without locking resources, checking for conflicts only at commit time. When concurrent transactions conflict, one receives a `40001` SQL state error. We handle this with Spring Retry:

```java
@Retryable(
    retryFor = OptimisticLockingFailureException.class,
    maxAttempts = 4,
    backoff = @Backoff(
        delay = 100,
        multiplier = 2,
        random = true
    ))
@Transactional
public void updateStock(UUID productId, int quantity) {
    Product product = productRepository.findById(productId)
        .orElseThrow(() -> new ProductNotFoundException(productId));
    product.setStock(product.getStock() + quantity);
    productRepository.save(product);
}
```

The `@Retryable` annotation automatically retries the operation when a concurrency conflict occurs:

- **Conflict detection** – Spring translates the `40001` SQL state to `OptimisticLockingFailureException`
- **Automatic retry** – If a conflict occurs, the method retries up to 4 times
- **Exponential backoff** – Wait times increase exponentially (100ms → 200ms → 400ms → 800ms)
- **Jitter** – Random delays prevent multiple retries from colliding again (known as the 'thundering herd' problem)

This pattern is essential for any operation that modifies data in Aurora DSQL, ensuring your application handles concurrent updates gracefully.

### Step 4: Build the REST API

The sample application includes a product inventory API that provides standard CRUD operations:

```java
@RestController
@RequestMapping("/api/products")
public class ProductController {

    @PostMapping
    public ResponseEntity<Product> createProduct(@RequestBody Product product) {
        Product created = productService.createProduct(product);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping
    public ResponseEntity<List<Product>> getAllProducts() {
        return ResponseEntity.ok(productService.getAllProducts());
    }

    @PatchMapping("/{id}/stock")
    public ResponseEntity<Map<String, String>> updateStock(
            @PathVariable UUID id,
            @RequestParam int quantity) {
        productService.updateStock(id, quantity);
        return ResponseEntity.ok(Map.of("message", "Stock updated"));
    }
}
```

### Step 5: Run and test the application

Build and run the application:

```bash
mvn clean install
mvn spring-boot:run
```

Initialize the database schema:

```bash
curl -X POST http://localhost:8080/api/products/init
```

Expected response: `HTTP/1.1 200 OK`

Create a product:

```bash
curl -X POST http://localhost:8080/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sample Product",
    "description": "A sample product for testing",
    "price": 29.99,
    "stock": 100
  }'
```

Expected response:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Sample Product",
  "description": "A sample product for testing",
  "price": 29.99,
  "stock": 100
}
```

Retrieve all products:

```bash
curl http://localhost:8080/api/products
```

Expected response:

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Sample Product",
    "description": "A sample product for testing",
    "price": 29.99,
    "stock": 100
  }
]
```

Update stock:

```bash
curl -X PATCH "http://localhost:8080/api/products/<product-id>/stock?quantity=50"
```

Expected response:

```json
{
  "message": "Stock updated"
}
```

## Key takeaways

The following are key considerations when building applications with Aurora DSQL:

1. **Aurora DSQL JDBC Connector** – The [Aurora DSQL JDBC Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/java/jdbc) handles IAM-based authentication, automatic token refresh, and TLS encryption. This eliminates the need for manual password management, token rotation logic, and SSL configuration.

2. **Optimistic concurrency** – Aurora DSQL uses optimistic concurrency control, which requires implementing retry logic but enables better scalability than pessimistic locking.

3. **Connection pooling** – Proper HikariCP configuration ensures efficient connection reuse and optimal performance.

## Security considerations

When deploying this application in a production environment, consider the following security best practices:

- **Network isolation** – Deploy your Spring Boot application within a VPC and use VPC endpoints to connect to Aurora DSQL without traversing the public internet.
- **Least privilege IAM** – Scope your IAM policy to the specific Aurora DSQL cluster ARN. Use `dsql:DbConnect` instead of `dsql:DbConnectAdmin` for application users that don't need administrative access.
- **Secrets management** – Ensure your AWS credentials are managed through IAM roles for Amazon EC2, Amazon ECS task roles, or IAM Roles Anywhere rather than long-lived access keys.

## Production considerations

The patterns in this post provide a foundation for production applications. For a production deployment, also consider:

- **Observability** – Add Amazon CloudWatch metrics for connection pool utilization, token refresh success/failure rates, and retry counts. Use structured logging with correlation IDs for request tracing.
- **Health checks** – Implement a Spring Boot Actuator health indicator that verifies database connectivity, so your load balancer can detect unhealthy instances.
- **Connection pool tuning** – Adjust HikariCP's `maximumPoolSize`, `minimumIdle`, and `connectionTimeout` based on your expected concurrency. Monitor pool metrics to right-size these values.
- **Cost awareness** – Aurora DSQL pricing is based on read and write operations. Review the [Aurora DSQL pricing page](https://aws.amazon.com/aurora/dsql/pricing/) to understand cost implications for your workload.

## Clean up

To avoid incurring future charges, delete the resources you created:

1. Delete the Aurora DSQL cluster from the AWS Console.
2. Remove any IAM roles or policies created for this walkthrough.
3. Delete the Spring Boot application artifacts.

## Conclusion

In this post, we demonstrated how to build a Spring Boot REST API that integrates with Amazon Aurora DSQL. By using the Aurora DSQL JDBC Connector for IAM authentication and TLS encryption, and implementing optimistic concurrency control with Spring Retry, you can build scalable, globally distributed applications without the operational overhead of traditional databases.

The sample code provides foundational patterns for authentication, concurrency control, and error handling that you can adapt to your own applications. Whether you're building a new application or evaluating Aurora DSQL for an existing workload, these patterns help you take advantage of the serverless, multi-Region capabilities of Aurora DSQL.

We welcome your feedback — try the sample application and let us know your experience in the comments, or contribute to the GitHub repository.

To learn more:

- [Amazon Aurora DSQL User Guide](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/)
- [Sample code on GitHub](https://github.com/aws-samples/sample-spring-boot-aurora-dsql)
- [Getting started with Amazon Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
- [Amazon Aurora DSQL pricing](https://aws.amazon.com/aurora/dsql/pricing/)

## About the authors

**Mirron Panicker** is a Technical Account Manager at AWS, where he partners with enterprise customers to optimize and modernize their cloud workloads. Mirron specializes in container technologies, helping teams adopt and scale containerized architectures on AWS.

**John Thach** is a Technical Account Manager at AWS. He works with enterprise customers to help them architect and optimize their workloads on AWS. John specializes in cloud operations and infrastructure design, helping teams build resilient, scalable systems.
