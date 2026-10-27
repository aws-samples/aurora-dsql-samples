# Dockerfile for the Flyway + Aurora DSQL sample.
#
# Base: flyway/flyway:11.20.3-alpine. Pinned to an exact version rather than
# the floating 11-alpine tag, so a new Flyway release cannot silently change
# what this sample builds against.
#
# Aurora DSQL support comes from the official Flyway community module
# org.flywaydb:flyway-database-dsql, plus the Aurora DSQL JDBC Connector,
# which the module expects you to supply. Both are pulled from Maven Central
# into /flyway/drivers/ where Flyway picks them up at startup.
#
# A note on versions: the module is published as 10.26.0, which is the version
# of the flyway-community-db-support project that houses it rather than a
# Flyway version. That release targets Flyway 11.9.0, and it loads correctly
# on the 11.20.3 runtime below.
#
# The AWS SDK jar list includes sso, ssooidc, sts and aws-query-protocol, plus
# commons-logging. None are needed to reach Aurora DSQL; all are needed to
# resolve the credentials. An IAM Identity Center profile (sso_session) needs
# sso and ssooidc, and a profile with role_arn and source_profile needs sts.
#
# sts and sso speak the AWS Query protocol rather than JSON, so they also need
# aws-query-protocol, and the Apache HTTP client needs commons-logging. Adding
# sso/ssooidc/sts without those two gets you a NoClassDefFoundError at the
# moment the credential chain runs, which is a worse failure than not shipping
# them at all: the profile looks supported and then dies mid-resolution.
#
# The jar count is checked below so a future trim cannot silently drop one.
#
# Helper tools (bash, psql, boto3, jq) are installed for the verification
# scripts.
#
# Build:  docker build -t flyway-dsql-sample .
# Usage:  see docker-compose.yml or the Makefile targets.

FROM flyway/flyway:11.20.3-alpine

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

# Versions are pinned so a rebuild produces the same classpath.
ARG FLYWAY_DSQL_MODULE_VERSION=10.26.0
ARG DSQL_CONNECTOR_VERSION=1.5.0
ARG AWS_SDK_VERSION=2.44.13
ARG PGJDBC_VERSION=42.7.11
# Pinned to 1.2 deliberately, and do not bump it casually. On this base image
# 1.3.5 makes the Flyway CLI exit 1 with ZERO output on stdout and stderr, on
# every command, including ones that never touch AWS. The image bundles
# slf4j-nop, and the newer JCL appears to lose that discovery fight in a way
# that kills the JVM before Flyway can log anything. jcl-over-slf4j, the usual
# bridge when slf4j is present, fails the same silent way. 1.2 works.
ARG COMMONS_LOGGING_VERSION=1.2

# Each jar is downloaded separately rather than shaded into one, so every
# META-INF/services descriptor survives. That matters for two reasons: Flyway
# discovers the module's DatabaseType through its service loader, and the JDK
# DriverManager auto-registers both the pgJDBC driver and the Aurora DSQL
# connector driver the same way.
#
# The base image already ships its own pgJDBC in /flyway/drivers/, and the
# Flyway launcher puts that directory on the classpath as a wildcard
# (drivers/*). Two postgresql jars under one wildcard means the JVM picks
# whichever it enumerates first, and that order is explicitly unspecified. So
# the bundled copy is removed before the pinned one is fetched, leaving exactly
# one pgJDBC on the classpath. Without this, sslNegotiation=direct and anything
# else newer than the bundled driver may or may not be available from one
# build to the next.
RUN set -eux; \
    M=https://repo1.maven.org/maven2; \
    fetch() { curl -fsSL -o "/flyway/drivers/$(basename "$1")" "$M/$1"; }; \
    \
    rm -f /flyway/drivers/postgresql-*.jar; \
    \
    fetch "org/flywaydb/flyway-database-dsql/${FLYWAY_DSQL_MODULE_VERSION}/flyway-database-dsql-${FLYWAY_DSQL_MODULE_VERSION}.jar"; \
    \
    fetch "software/amazon/dsql/aurora-dsql-jdbc-connector/${DSQL_CONNECTOR_VERSION}/aurora-dsql-jdbc-connector-${DSQL_CONNECTOR_VERSION}.jar"; \
    fetch "org/postgresql/postgresql/${PGJDBC_VERSION}/postgresql-${PGJDBC_VERSION}.jar"; \
    \
    for a in dsql sdk-core aws-core auth identity-spi http-client-spi regions \
             utils annotations metrics-spi profiles json-utils endpoints-spi \
             apache-client netty-nio-client http-auth http-auth-spi \
             http-auth-aws checksums checksums-spi retries retries-spi \
             aws-json-protocol protocol-core third-party-jackson-core \
             sso ssooidc sts aws-query-protocol; do \
      fetch "software/amazon/awssdk/$a/${AWS_SDK_VERSION}/$a-${AWS_SDK_VERSION}.jar"; \
    done; \
    fetch "software/amazon/eventstream/eventstream/1.0.1/eventstream-1.0.1.jar"; \
    fetch "org/reactivestreams/reactive-streams/1.0.4/reactive-streams-1.0.4.jar"; \
    fetch "commons-logging/commons-logging/${COMMONS_LOGGING_VERSION}/commons-logging-${COMMONS_LOGGING_VERSION}.jar"; \
    \
    test "$(ls -1 /flyway/drivers/postgresql-*.jar | wc -l)" -eq 1; \
    for required in sso ssooidc sts aws-query-protocol commons-logging; do \
      ls /flyway/drivers/ | grep -q "^${required}-" \
        || { echo "missing required jar: ${required}" >&2; exit 1; }; \
    done; \
    ls -1 /flyway/drivers/

# Clear the base image's ENTRYPOINT so docker-compose's `command:` and
# `docker compose run <service> <command>` work transparently.
ENTRYPOINT []
CMD ["flyway", "--version"]
