## Pre-launch setup instructions for Maven

As Aurora DSQL is not yet announced in order to verify the maven build requires that a local installation of the `AwsJavaSDK-dsql-2.0.jar`

Steps:

### Compile and Execute Example

From root of this repository

The CRUD examples described below are all contained in `Example.java`

#### Maven

```
# Use the account credentials dedicated for java
export CLUSTER_ENDPOINT="<your cluster endpoint>"
export REGION="<your cluster region>"
mvn validate
mvn initialize
mvn clean compile assembly:single
mvn test
```

#### Gradle

```
export CLUSTER_ENDPOINT="<your cluster endpoint>"
export REGION="<your cluster region>"
gradle wrapper

./gradlew run
```
