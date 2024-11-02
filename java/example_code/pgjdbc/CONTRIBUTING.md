## Pre-launch setup instructions for Maven

As Aurora DSQL is not yet announced in order to verify the maven build requires that a local installation of the `AwsJavaSDK-AxdbFrontend-2.0.jar`

Steps:

### Compile and Execute Example

From root of this repository

The CRUD examples described below are all contained in `HelloCrud.java`

### Refresh the credentials

`ada credentials update --role=ConnectRole --account 851725170178 --once`

#### Maven

```
mvn validate
mvn clean compile assembly:single
java -jar target/helloDSQL-1.0-SNAPSHOT-jar-with-dependencies.jar
```

#### Gradle

```

```

```

```
