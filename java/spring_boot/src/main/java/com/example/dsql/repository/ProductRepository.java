package com.example.dsql.repository;

import com.example.dsql.model.Product;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class ProductRepository {

    private final JdbcTemplate jdbcTemplate;

    public ProductRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void initSchema() {
        try {
            jdbcTemplate.execute("CREATE SCHEMA IF NOT EXISTS app");
        } catch (Exception e) {
            // Schema might already exist
        }

        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS app.products (
                    id UUID PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    description TEXT,
                    price DECIMAL(10, 2) NOT NULL,
                    stock INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """);
        } catch (Exception e) {
            // Table might already exist or there's a syntax issue
            throw new RuntimeException("Failed to initialize schema: " + e.getMessage(), e);
        }
    }

    public Product save(Product product) {
        if (product.getId() == null) {
            product.setId(UUID.randomUUID());
        }

        jdbcTemplate.update("""
            INSERT INTO app.products (id, name, description, price, stock, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """, product.getId(), product.getName(), product.getDescription(),
                product.getPrice(), product.getStock());

        return findById(product.getId()).orElseThrow();
    }

    public Optional<Product> findById(UUID id) {
        List<Product> products = jdbcTemplate.query("""
            SELECT * FROM app.products WHERE id = ?
        """, new ProductRowMapper(), id);

        return products.isEmpty() ? Optional.empty() : Optional.of(products.get(0));
    }

    public List<Product> findAll() {
        return jdbcTemplate.query("""
            SELECT * FROM app.products ORDER BY created_at DESC
        """, new ProductRowMapper());
    }

    public Product update(Product product) {
        jdbcTemplate.update("""
            UPDATE app.products
            SET name = ?, description = ?, price = ?, stock = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, product.getName(), product.getDescription(), product.getPrice(),
                product.getStock(), product.getId());

        return findById(product.getId()).orElseThrow();
    }

    public void deleteById(UUID id) {
        jdbcTemplate.update("DELETE FROM app.products WHERE id = ?", id);
    }

    public void updateStock(UUID id, int quantity) {
        jdbcTemplate.update("""
            UPDATE app.products
            SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, quantity, id);
    }

    private static class ProductRowMapper implements RowMapper<Product> {
        @Override
        public Product mapRow(ResultSet rs, int rowNum) throws SQLException {
            Product product = new Product();
            product.setId(UUID.fromString(rs.getString("id")));
            product.setName(rs.getString("name"));
            product.setDescription(rs.getString("description"));
            product.setPrice(rs.getBigDecimal("price"));
            product.setStock(rs.getInt("stock"));
            product.setCreatedAt(rs.getTimestamp("created_at").toLocalDateTime());
            product.setUpdatedAt(rs.getTimestamp("updated_at").toLocalDateTime());
            return product;
        }
    }
}
