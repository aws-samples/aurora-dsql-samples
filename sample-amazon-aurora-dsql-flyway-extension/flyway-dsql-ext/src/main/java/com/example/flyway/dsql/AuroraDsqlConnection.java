// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package com.example.flyway.dsql;

import org.flywaydb.core.api.FlywayException;
import org.flywaydb.core.internal.database.base.Table;
import org.flywaydb.database.postgresql.PostgreSQLConnection;
import org.flywaydb.database.postgresql.PostgreSQLDatabase;

import java.sql.SQLException;
import java.util.concurrent.Callable;

/**
 * Aurora DSQL variant of {@link PostgreSQLConnection}.
 * <p>
 * Overrides two PostgreSQL-isms that don't translate to Aurora DSQL's
 * distributed architecture:
 * <ol>
 *   <li>{@link #doRestoreOriginalState()} is a no-op instead of running
 *       {@code SET role = <original>}. Aurora DSQL rejects any SET of
 *       the {@code role} configuration parameter with SQLSTATE
 *       {@code 0A000} because database identity is managed through IAM.</li>
 *   <li>{@link #lock(Table, Callable)} is overridden to run the callable
 *       directly without taking a PostgreSQL advisory lock. The parent
 *       implementation calls {@code pg_try_advisory_xact_lock}, which
 *       Aurora DSQL does not support (advisory locks are a single-node
 *       PostgreSQL feature). Concurrency safety on Aurora DSQL comes
 *       from the schema-history row insert, which uses optimistic
 *       concurrency control at commit time; the shell-level retry loop
 *       in run-flyway.sh handles the resulting {@code SQLSTATE 40001}
 *       conflicts.</li>
 * </ol>
 */
public class AuroraDsqlConnection extends PostgreSQLConnection {

    public AuroraDsqlConnection(PostgreSQLDatabase database, java.sql.Connection connection) {
        super(database, connection);
    }

    @Override
    protected void doRestoreOriginalState() throws SQLException {
        // Intentionally empty. See class javadoc.
    }

    @Override
    public <T> T lock(Table table, Callable<T> callable) {
        // Aurora DSQL has no equivalent of PostgreSQL advisory locks.
        // Run the migration body directly; serialization is enforced at
        // the schema-history INSERT via OCC at commit time, and the
        // shell runner retries SQLSTATE 40001 conflicts.
        try {
            return callable.call();
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new FlywayException("Migration failed", e);
        }
    }
}
