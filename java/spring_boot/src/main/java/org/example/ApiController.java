package org.example;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ApiController {

    private final JdbcTemplate jdbcTemplate;

    public ApiController(final JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping(value = "/select1")
    public Integer getOne() {
        return jdbcTemplate.queryForObject("SELECT 1;", Integer.class);
    }
}