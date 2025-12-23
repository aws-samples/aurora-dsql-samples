package org.example;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

public class ExamplePreferredTest {
    @Test
    public void testExamplePreferred() {
        assertAll(() -> ExamplePreferred.main(new String[]{}));
    }
}