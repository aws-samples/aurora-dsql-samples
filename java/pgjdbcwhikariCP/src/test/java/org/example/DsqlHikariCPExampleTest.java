package org.example;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

public class DsqlHikariCPExampleTest {
    @Test
    public void testHikariCPExample() {
        assertAll(() -> Example.main(new String[]{}));
    }
}
