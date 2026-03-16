package com.example.dsql;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.retry.annotation.EnableRetry;

@SpringBootApplication
@EnableRetry
public class AuroraDsqlApplication {
    public static void main(String[] args) {
        SpringApplication.run(AuroraDsqlApplication.class, args);
    }
}
