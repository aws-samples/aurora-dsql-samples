package org.example.alternatives.no_connection_pool;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

public class ExampleWithNoConnectionPoolTest {
    @Test
    public void testExampleWithNoConnectionPool() {
        assertAll(() -> ExampleWithNoConnectionPool.main(new String[]{}));
    }
}
