// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package com.example.dsql.batch_operations;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

public class MainTest {
    @Test
    public void testBatchOperations() {
        assertAll(() -> Main.main(new String[]{
            "--endpoint", System.getenv("CLUSTER_ENDPOINT"),
            "--user", System.getenv().getOrDefault("CLUSTER_USER", "admin")
        }));
    }
}
