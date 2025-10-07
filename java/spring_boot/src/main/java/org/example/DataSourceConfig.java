package org.example;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dsql.DsqlUtilities;
import software.amazon.awssdk.services.dsql.model.GenerateAuthTokenRequest;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;

@Configuration
public class DataSourceConfig {

    private final String username;
    private final DsqlUtilities dsqlUtilities;
    private final GenerateAuthTokenRequest tokenRequest;

    public DataSourceConfig(@Value("${cluster.user}") final String username,
                            @Value("${cluster.endpoint}") final String clusterEndpoint,
                            @Value("${cluster.region}") final String region) {
        this.username = username;
        this.dsqlUtilities = DsqlUtilities.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.builder().build())
                .build();

        this.tokenRequest = GenerateAuthTokenRequest.builder()
                .hostname(clusterEndpoint)
                .region(Region.of(region))
                .build();
    }

    @Bean
    @Primary
    @ConfigurationProperties("spring.datasource.hikari")
    public DataSource dataSource(final DataSourceProperties properties) {
        return new HikariDataSource() {
            {
                setJdbcUrl(properties.getUrl());
                setUsername(properties.getUsername());
                if (!username.equals("admin")) {
                    setConnectionInitSql("SET search_path=myschema");
                }
            }

            @Override
            public Connection getConnection() throws SQLException {
                setPassword(generateAuthToken());
                return super.getConnection();
            }
        };
    }

    private String generateAuthToken() {
        if (username.equals("admin")) {
            return dsqlUtilities.generateDbConnectAdminAuthToken(tokenRequest);
        } else {
            return dsqlUtilities.generateDbConnectAuthToken(tokenRequest);
        }
    }
}
