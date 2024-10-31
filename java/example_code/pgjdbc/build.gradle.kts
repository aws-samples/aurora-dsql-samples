plugins {
    id("java")
    id("application")
}

application {
    mainClass = "org.example.HelloCrud"
}

group = "org.example"
version = "1.0-SNAPSHOT"

repositories {
    mavenCentral()
}

dependencies {
    testImplementation(platform("org.junit:junit-bom:5.10.0"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    implementation("org.postgresql:postgresql:42.7.4")
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.jar"))))
    implementation("software.amazon.awssdk:aws-core:2.29.2")
}

tasks.test {
    useJUnitPlatform()
}
