## Pre-launch setup instructions for Maven

As Aurora DSQL is not yet announced in order to verify the maven build requires that a local installation of the `AwsJavaSDK-AxdbFrontend-2.0.jar`

Steps:
From root of this repository
```
cd libs
mvn install:install-file -Dfile=AwsJavaSdk-AxdbFrontend-2.0.jar -DgroupId=com.amazon -DartifactId=aws-token-generator-java -Dversion=2.0 -Dpackaging=jar
```