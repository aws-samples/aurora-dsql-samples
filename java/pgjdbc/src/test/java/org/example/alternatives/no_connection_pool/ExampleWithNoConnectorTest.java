package org.example.alternatives.no_connection_pool;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

public class ExampleWithNoConnectorTest {
    @Test
    public void testExampleWithNoConnector() {
        assertAll(() -> ExampleWithNoConnector.main(new String[]{}));
    }
}
