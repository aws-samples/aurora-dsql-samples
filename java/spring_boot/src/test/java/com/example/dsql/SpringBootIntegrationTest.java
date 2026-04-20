/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
package com.example.dsql;

import com.example.dsql.model.Product;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for the Aurora DSQL Spring Boot sample application.
 * Requires CLUSTER_ENDPOINT and CLUSTER_USER environment variables.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
public class SpringBootIntegrationTest {

    @TestConfiguration
    static class TestConfig {
        @Bean
        public RestTemplateBuilder restTemplateBuilder() {
            return new RestTemplateBuilder()
                    .requestFactory(() -> new HttpComponentsClientHttpRequestFactory(
                            HttpClients.createDefault()));
        }
    }

    @Autowired
    private TestRestTemplate restTemplate;

    private static UUID createdProductId;

    @Test
    @Order(1)
    void initSchema() {
        ResponseEntity<Map> resp = restTemplate.postForEntity("/api/products/init", null, Map.class);
        assertEquals(HttpStatus.OK, resp.getStatusCode());
    }

    @Test
    @Order(2)
    void createProduct() {
        Product p = new Product();
        p.setName("Integration Test Product");
        p.setDescription("Created by integration test");
        p.setPrice(new BigDecimal("19.99"));
        p.setStock(50);

        ResponseEntity<Product> resp = restTemplate.postForEntity("/api/products", p, Product.class);
        assertEquals(HttpStatus.CREATED, resp.getStatusCode());
        assertNotNull(resp.getBody());
        assertNotNull(resp.getBody().getId());
        assertEquals("Integration Test Product", resp.getBody().getName());
        createdProductId = resp.getBody().getId();
    }

    @Test
    @Order(3)
    void getProduct() {
        assertNotNull(createdProductId, "Product must be created first");
        ResponseEntity<Product> resp = restTemplate.getForEntity("/api/products/" + createdProductId, Product.class);
        assertEquals(HttpStatus.OK, resp.getStatusCode());
        assertEquals(createdProductId, resp.getBody().getId());
    }

    @Test
    @Order(4)
    void getAllProducts() {
        ResponseEntity<List<Product>> resp = restTemplate.exchange(
                "/api/products", HttpMethod.GET, null,
                new ParameterizedTypeReference<>() {});
        assertEquals(HttpStatus.OK, resp.getStatusCode());
        assertFalse(resp.getBody().isEmpty());
    }

    @Test
    @Order(5)
    void updateProduct() {
        assertNotNull(createdProductId);
        Product updated = new Product();
        updated.setName("Updated Product");
        updated.setDescription("Updated by integration test");
        updated.setPrice(new BigDecimal("29.99"));
        updated.setStock(75);

        restTemplate.put("/api/products/" + createdProductId, updated);

        ResponseEntity<Product> resp = restTemplate.getForEntity("/api/products/" + createdProductId, Product.class);
        assertEquals("Updated Product", resp.getBody().getName());
    }

    @Test
    @Order(6)
    void updateStock() {
        assertNotNull(createdProductId);
        ResponseEntity<Map> resp = restTemplate.exchange(
                "/api/products/" + createdProductId + "/stock?quantity=10",
                HttpMethod.PATCH, null, Map.class);
        assertEquals(HttpStatus.OK, resp.getStatusCode());

        ResponseEntity<Product> product = restTemplate.getForEntity("/api/products/" + createdProductId, Product.class);
        assertEquals(85, product.getBody().getStock());
    }

    @Test
    @Order(7)
    void deleteProduct() {
        assertNotNull(createdProductId);
        restTemplate.delete("/api/products/" + createdProductId);

        ResponseEntity<String> resp = restTemplate.getForEntity("/api/products/" + createdProductId, String.class);
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, resp.getStatusCode());
    }

    @Test
    @Order(8)
    void healthCheck() {
        ResponseEntity<Map> resp = restTemplate.getForEntity("/api/products/health", Map.class);
        assertEquals(HttpStatus.OK, resp.getStatusCode());
        assertEquals("UP", resp.getBody().get("status"));
    }
}
