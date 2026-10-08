# Dockerfile for the Flyway + Aurora DSQL POC.
#
# Base: flyway/flyway:11-alpine (multi-arch Alpine image with Flyway Community 11).
#
# Multi-stage build:
#   Stage 1 ("builder"): JDK 17 + Gradle, compiles the local
#     flyway-dsql-ext/ Java project into a fat jar containing the
#     Flyway database-type extension plus the Aurora DSQL JDBC Connector
#     (and its AWS SDK transitive deps).
#   Stage 2 (final): the Flyway runtime image, with the extension jar
#     copied into /flyway/drivers/ so Flyway's classpath picks it up at
#     startup. Helper tools (bash, psql, boto3, jq) are also installed
#     for the verification scripts.
#
# Build:  docker build -t flyway-dsql-poc .
# Usage:  see docker-compose.yml or the Makefile targets.

# -----------------------------------------------------------------------
# Stage 1: build the Flyway + Aurora DSQL extension jar
# -----------------------------------------------------------------------
# gradle:8.10-jdk17 is multi-arch (linux/amd64 + linux/arm64) and ships
# JDK 17 + Gradle 8.10 preinstalled. Compiles our Flyway extension and
# the Aurora DSQL JDBC Connector into a single fat jar.
FROM gradle:8.10-jdk17 AS builder
WORKDIR /src

COPY flyway-dsql-ext /src/flyway-dsql-ext
WORKDIR /src/flyway-dsql-ext

# --no-daemon keeps the Gradle daemon from lingering past the build.
RUN gradle --no-daemon jar

# -----------------------------------------------------------------------
# Stage 2: Flyway runtime with the extension installed
# -----------------------------------------------------------------------
FROM flyway/flyway:11-alpine

USER root

RUN apk add --no-cache \
      bash \
      curl \
      jq \
      postgresql-client \
      python3 \
      py3-pip \
    && pip3 install --break-system-packages 'boto3>=1.35' \
    && rm -rf /var/cache/apk/*

# Copy the thin extension jar plus every runtime dependency jar into
# Flyway's drivers directory. Keeping each jar separate preserves each
# one's META-INF/services/java.sql.Driver descriptor so the JDK's
# DriverManager auto-registers both the pgJDBC driver and the Aurora
# DSQL JDBC Connector driver.
COPY --from=builder /src/flyway-dsql-ext/build/libs/flyway-dsql-ext-1.0.0.jar \
     /flyway/drivers/flyway-dsql-ext-1.0.0.jar
COPY --from=builder /src/flyway-dsql-ext/build/libs/deps/ /flyway/drivers/

# Clear the base image's ENTRYPOINT so docker-compose's `command:` and
# `docker compose run <service> <command>` work transparently.
ENTRYPOINT []
CMD ["flyway", "--version"]
