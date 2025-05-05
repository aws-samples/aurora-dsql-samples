package org.example;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

public class DsqlExampleTest {
    @Test
    public void testExample() {
        assertAll(() -> Example.main(new String[]{}));
    }
}