// Flyway extension for Amazon Aurora DSQL.
//
// Produces:
//   build/libs/flyway-dsql-ext-1.0.0.jar  - thin jar with just our 3 classes
//   build/libs/deps/*.jar                 - every runtime dependency jar
//                                           (Aurora DSQL JDBC Connector + pgJDBC
//                                           + AWS SDK). Dropped as separate jars
//                                           so each keeps its own
//                                           META-INF/services/java.sql.Driver
//                                           descriptor, which the JDK
//                                           DriverManager needs to auto-register
//                                           both drivers.
//
// Drop both artifact sets into Flyway's /flyway/drivers/ directory.

plugins {
    `java-library`
}

group = "com.example.flyway.dsql"
version = "1.0.0"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(17)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    // Flyway core API and the PostgreSQL plugin that we extend. Both are
    // compileOnly because they ship in the Flyway runtime that will load
    // this jar.
    compileOnly("org.flywaydb:flyway-core:11.20.3")
    compileOnly("org.flywaydb:flyway-database-postgresql:11.20.3")

    // Aurora DSQL JDBC Connector; pulls in pgJDBC and the AWS SDK as
    // transitive deps. These are copied as separate jars into
    // build/libs/deps/ (see copyDeps task below).
    implementation("software.amazon.dsql:aurora-dsql-jdbc-connector:1.0.0")
}

tasks.named<Jar>("jar") {
    manifest {
        attributes(
            "Implementation-Title" to "Flyway extension for Amazon Aurora DSQL",
            "Implementation-Version" to project.version
        )
    }
}

tasks.register<Copy>("copyDeps") {
    from(configurations.runtimeClasspath)
    into(layout.buildDirectory.dir("libs/deps"))
}

tasks.named("build") {
    dependsOn("copyDeps")
}

// Make `gradle jar` also materialize the deps so the Dockerfile's single
// RUN step produces both the thin jar and the dep jars.
tasks.named("jar") {
    finalizedBy("copyDeps")
}
