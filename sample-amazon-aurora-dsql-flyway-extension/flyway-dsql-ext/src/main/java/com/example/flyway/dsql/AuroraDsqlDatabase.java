// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package com.example.flyway.dsql;

import org.flywaydb.core.api.configuration.Configuration;
import org.flywaydb.core.internal.database.base.Table;
import org.flywaydb.core.internal.jdbc.JdbcConnectionFactory;
import org.flywaydb.core.internal.jdbc.StatementInterceptor;
import org.flywaydb.database.postgresql.PostgreSQLConnection;
import org.flywaydb.database.postgresql.PostgreSQLDatabase;

/**
 * Aurora DSQL variant of {@link PostgreSQLDatabase}.
 * <p>
 * Overrides two parent behaviors:
 * <ol>
 *   <li>{@link #doGetConnection} returns an {@link AuroraDsqlConnection}
 *       (which no-ops {@code SET role} and skips advisory locks).</li>
 *   <li>{@link #getRawCreateScript} returns a schema-history-table
 *       {@code CREATE TABLE} that inlines the primary key. The parent
 *       implementation emits a separate {@code ALTER TABLE ADD
 *       CONSTRAINT pk_...} statement, which Aurora DSQL rejects with
 *       SQLSTATE {@code 0A000} ("unsupported ALTER TABLE ADD CONSTRAINT
 *       statement"). Aurora DSQL requires primary keys to be declared
 *       at table-creation time.</li>
 * </ol>
 */
public class AuroraDsqlDatabase extends PostgreSQLDatabase {

    public AuroraDsqlDatabase(Configuration configuration,
                              JdbcConnectionFactory jdbcConnectionFactory,
                              StatementInterceptor statementInterceptor) {
        super(configuration, jdbcConnectionFactory, statementInterceptor);
    }

    @Override
    protected PostgreSQLConnection doGetConnection(java.sql.Connection connection) {
        return new AuroraDsqlConnection(this, connection);
    }

    /**
     * Aurora DSQL does not support DDL inside a transaction (SQLSTATE
     * {@code 0A000}: "multiple ddl statements not supported in a
     * transaction"). Returning {@code false} tells Flyway to run each
     * statement with autocommit on, so a multi-statement migration like
     * "ADD COLUMN; UPDATE; ..." does not try to execute inside a single
     * BEGIN/COMMIT.
     * <p>
     * Note: this trades off atomicity. A migration that fails on its 3rd
     * statement leaves the effects of statements 1 and 2 in place. On
     * DSQL this is unavoidable at the engine level; Flyway's history
     * table still records the migration as failed, and operators should
     * design migrations to be idempotent (e.g. {@code CREATE TABLE IF
     * NOT EXISTS}, {@code ADD COLUMN IF NOT EXISTS}).
     */
    @Override
    public boolean supportsDdlTransactions() {
        return false;
    }

    @Override
    public String getRawCreateScript(Table table, boolean baseline) {
        // Mirror of PostgreSQLDatabase.getRawCreateScript, adjusted for
        // Aurora DSQL:
        //   - Primary key is declared inline (DSQL rejects ALTER TABLE
        //     ADD CONSTRAINT).
        //   - No secondary index on `success`. DSQL requires one DDL per
        //     transaction, but Flyway submits the create script with
        //     autocommit off, so a second statement in the same string
        //     fails. Flyway's history table has few rows, so the missing
        //     index has no practical impact.
        //   - No baseline statement (Flyway's baseline insert is handled
        //     separately by the migration pipeline, not here).
        return "CREATE TABLE IF NOT EXISTS " + table + " (\n" +
                "    \"installed_rank\" INT NOT NULL,\n" +
                "    \"version\" VARCHAR(50),\n" +
                "    \"description\" VARCHAR(200) NOT NULL,\n" +
                "    \"type\" VARCHAR(20) NOT NULL,\n" +
                "    \"script\" VARCHAR(1000) NOT NULL,\n" +
                "    \"checksum\" INTEGER,\n" +
                "    \"installed_by\" VARCHAR(100) NOT NULL,\n" +
                "    \"installed_on\" TIMESTAMP NOT NULL DEFAULT NOW(),\n" +
                "    \"execution_time\" INTEGER NOT NULL,\n" +
                "    \"success\" BOOLEAN NOT NULL,\n" +
                "    PRIMARY KEY (\"installed_rank\")\n" +
                ");";
    }
}
