/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package software.amazon.dsql.examples;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

public class ExamplePreferredTest {
    @Test
    public void testExamplePreferred() {
        assertAll(() -> ExamplePreferred.main(new String[]{}));
    }
}
