package org.example;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class DatabaseService {

    private final JdbcTemplate jdbcTemplate;

    public DatabaseService(final JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void testConnection() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS owner (
                    id uuid NOT NULL DEFAULT gen_random_uuid(),
                    name varchar(30) NOT NULL,
                    city varchar(80) NOT NULL,
                    telephone varchar(20) DEFAULT NULL,
                    PRIMARY KEY (id)
                )""");

        jdbcTemplate.update(
                "INSERT INTO owner (name, city, telephone) VALUES (?, ?, ?)",
                "John Doe", "Anytown", "555-555-1999");

        jdbcTemplate.query("SELECT * FROM owner", rs -> {
            while (rs.next()) {
                assert rs.getString("id") != null;
                assert rs.getString("name").equals("John Doe");
                assert rs.getString("city").equals("Anytown");
                assert rs.getString("telephone").equals("555-555-1999");
            }
        });

        jdbcTemplate.update("DELETE FROM owner WHERE name = ?", "John Doe");
    }
}
