package org.example;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.web.client.RestTemplate;

@SpringBootApplication
public class Application implements CommandLineRunner {

    private final DatabaseService databaseService;
    private final ConfigurableApplicationContext context;
    private final RestTemplate restTemplate;

    @Value("${app.exit-after-test:false}")
    private boolean exitAfterTest;

    @Value("${server.port:8080}")
    private int serverPort;

    public Application(
            final DatabaseService databaseService,
            final ConfigurableApplicationContext context,
            final RestTemplateBuilder restTemplateBuilder) {
        this.databaseService = databaseService;
        this.context = context;
        this.restTemplate = restTemplateBuilder.build();
    }

    public static void main(final String[] args) {
        SpringApplication.run(Application.class, args);
    }

    @Override
    public void run(final String... args) throws Exception {
        databaseService.testConnection();
        System.out.println("Database operations test completed successfully");

        final String url = "http://localhost:" + serverPort + "/select1";
        final Integer result = restTemplate.getForObject(url, Integer.class);
        assert result != null && result.equals(1);
        System.out.println("REST API endpoint test completed successfully");

        if (exitAfterTest) {
            context.close();
        }
    }
}
