## Pre-launch setup instructions for Maven

As Aurora DSQL is not yet announced in order to verify the maven build requires that a local installation of the `AwsJavaSDK-dsql-2.0.jar`

Steps:

### Set cluster endpoint

Update the following code of `src/main/java/org/example/Example.java`. Set `<your_cluster_endpoint>` to your cluster endpoint. Set REGION to your cluster region.

```
String cluster_endpoint = "<your_cluster_endpoint>";
String REGION = "<cluster region>";
```


### Compile and Execute Example

From root of this repository

The CRUD examples described below are all contained in `Example.java`

#### Maven

```
# Use the account credentials dedicated for java
ada credentials update --role=Admin --account 897729098254 --once
mvn validate
mvn initialize
mvn clean compile assembly:single
java -jar target/AuroraDSQLExample-1.0-SNAPSHOT-jar-with-dependencies.jar
```

#### Gradle

```
gradle wrapper

./gradlew run
```
