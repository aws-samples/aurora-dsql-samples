// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package com.example.flyway.dsql;

import org.flywaydb.core.api.configuration.Configuration;
import org.flywaydb.core.internal.database.base.Database;
import org.flywaydb.core.internal.jdbc.JdbcConnectionFactory;
import org.flywaydb.core.internal.jdbc.StatementInterceptor;
import org.flywaydb.database.postgresql.PostgreSQLDatabaseType;

/**
 * Flyway {@code DatabaseType} for Amazon Aurora DSQL.
 * <p>
 * Extends the stock {@link PostgreSQLDatabaseType} and adds two behaviors
 * on top of it:
 * <ol>
 *   <li>Claims the {@code jdbc:aws-dsql:postgresql://*} URL prefix used
 *       by the official Aurora DSQL JDBC Connector, so Flyway's plugin
 *       loader recognizes it.</li>
 *   <li>Returns an {@link AuroraDsqlDatabase} instance from
 *       {@link #createDatabase}, which in turn returns an
 *       {@link AuroraDsqlConnection} that no-ops the per-operation
 *       {@code SET role = <original>} that Aurora DSQL rejects.</li>
 * </ol>
 */
public class AuroraDsqlDatabaseType extends PostgreSQLDatabaseType {

    private static final String AURORA_DSQL_URL_PREFIX = "jdbc:aws-dsql:postgresql:";
    private static final String AURORA_DSQL_DRIVER_CLASS = "software.amazon.dsql.jdbc.DSQLConnector";

    // Force the Aurora DSQL JDBC Connector to register itself with
    // java.sql.DriverManager at class load time, in case Flyway's
    // DriverManager.getDriver(url) call runs before the connector's
    // META-INF/services/java.sql.Driver entry has been scanned.
    static {
        try {
            Class.forName(AURORA_DSQL_DRIVER_CLASS);
        } catch (ClassNotFoundException ignored) {
            // The runtime will surface this clearly in getDriverClass().
        }
    }

    @Override
    public String getName() {
        return "Aurora DSQL";
    }

    @Override
    public int getPriority() {
        // Must beat PostgreSQLDatabaseType so our type wins when both
        // match. Higher integers win.
        return super.getPriority() + 10;
    }

    @Override
    public boolean handlesJDBCUrl(String url) {
        if (url == null) {
            return false;
        }
        return url.startsWith(AURORA_DSQL_URL_PREFIX) || super.handlesJDBCUrl(url);
    }

    @Override
    public String getDriverClass(String url, ClassLoader classLoader) {
        if (url != null && url.startsWith(AURORA_DSQL_URL_PREFIX)) {
            // The Aurora DSQL JDBC Connector registers itself under this
            // driver class. The driver auto-mints an IAM token for every
            // new connection using the ambient AWS credentials.
            return AURORA_DSQL_DRIVER_CLASS;
        }
        return super.getDriverClass(url, classLoader);
    }

    @Override
    public Database<?> createDatabase(Configuration configuration,
                                      JdbcConnectionFactory jdbcConnectionFactory,
                                      StatementInterceptor statementInterceptor) {
        return new AuroraDsqlDatabase(configuration, jdbcConnectionFactory, statementInterceptor);
    }
}
