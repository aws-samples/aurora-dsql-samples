import org.gradle.api.tasks.testing.logging.TestExceptionFormat

plugins {
    id("java")
    id("application")
}

application {
    mainClass = "org.example.Example"
}

group = "org.example"
version = "1.0-SNAPSHOT"

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.postgresql:postgresql:42.7.4")
    implementation("software.amazon.awssdk:dsql:2.31.32")
    implementation("org.slf4j:slf4j-api:2.0.17")
    implementation("org.slf4j:slf4j-simple:2.0.17")
}

tasks.test {
    useJUnitPlatform()

    testLogging {
        events("passed", "skipped", "failed", "standardOut", "standardError")
        exceptionFormat = TestExceptionFormat.FULL
    }
}

tasks.withType<Test> {
    this.testLogging {
        this.showStandardStreams = true
    }
}

tasks.withType<JavaExec> {
    this.enableAssertions = true
}