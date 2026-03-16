package com.example.dsql.config;

import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.SQLExceptionOverride;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.jdbc.support.SQLExceptionTranslator;
import org.springframework.jdbc.support.SQLStateSQLExceptionTranslator;

import javax.sql.DataSource;
import java.sql.SQLException;

@Configuration
public class DsqlDataSourceConfig {

    private static final String DSQL_OPTIMISTIC_CONCURRENCY_ERROR_STATE = "40001";

    @Bean
    @ConfigurationProperties("spring.datasource")
    public DataSourceProperties dsqlDataSourceProperties() {
        return new DataSourceProperties();
    }

    // The Aurora DSQL JDBC Connector handles IAM authentication, token refresh, and SSL automatically
    @Bean
    @ConfigurationProperties("spring.datasource.hikari")
    public HikariDataSource dsqlDataSource(DataSourceProperties dsqlDataSourceProperties) {
        HikariDataSource dataSource = dsqlDataSourceProperties
                .initializeDataSourceBuilder()
                .type(HikariDataSource.class)
                .build();
        dataSource.setExceptionOverrideClassName(DsqlExceptionOverride.class.getName());
        return dataSource;
    }

    @Bean
    public DsqlSQLExceptionTranslator dsqlSQLExceptionTranslator() {
        return new DsqlSQLExceptionTranslator();
    }

    @Bean
    public JdbcTransactionManager transactionManager(DataSource dataSource,
                                                      DsqlSQLExceptionTranslator dsqlSQLExceptionTranslator) {
        JdbcTransactionManager transactionManager = new JdbcTransactionManager(dataSource);
        transactionManager.setExceptionTranslator(dsqlSQLExceptionTranslator);
        return transactionManager;
    }

    static class DsqlSQLExceptionTranslator implements SQLExceptionTranslator {
        private final SQLStateSQLExceptionTranslator delegate = new SQLStateSQLExceptionTranslator();

        @Override
        public DataAccessException translate(String task, String sql, SQLException ex) {
            if (DSQL_OPTIMISTIC_CONCURRENCY_ERROR_STATE.equals(ex.getSQLState())) {
                return new OptimisticLockingFailureException(ex.getMessage(), ex);
            }
            return delegate.translate(task, sql, ex);
        }
    }

    public static class DsqlExceptionOverride implements SQLExceptionOverride {
        public SQLExceptionOverride.Override adjudicate(SQLException ex) {
            if (DSQL_OPTIMISTIC_CONCURRENCY_ERROR_STATE.equals(ex.getSQLState())) {
                return SQLExceptionOverride.Override.DO_NOT_EVICT;
            }
            return SQLExceptionOverride.Override.CONTINUE_EVICT;
        }
    }
}
