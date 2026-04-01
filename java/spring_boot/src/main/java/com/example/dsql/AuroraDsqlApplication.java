package com.example.dsql;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.core.Ordered;
import org.springframework.retry.annotation.EnableRetry;

@SpringBootApplication
@EnableRetry(order = Ordered.LOWEST_PRECEDENCE - 1)
public class AuroraDsqlApplication {
    public static void main(String[] args) {
        SpringApplication.run(AuroraDsqlApplication.class, args);
    }
}
