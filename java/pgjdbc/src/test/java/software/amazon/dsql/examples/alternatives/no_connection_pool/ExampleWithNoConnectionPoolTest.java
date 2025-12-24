/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package software.amazon.dsql.examples.alternatives.no_connection_pool;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

public class ExampleWithNoConnectionPoolTest {
    @Test
    public void testExampleWithNoConnectionPool() {
        assertAll(() -> ExampleWithNoConnectionPool.main(new String[]{}));
    }
}
