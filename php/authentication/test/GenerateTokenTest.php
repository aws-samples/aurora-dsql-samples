<?php
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../src/generate_token.php';

use PHPUnit\Framework\TestCase;

class GenerateTokenTest extends TestCase
{
    public function testGenerateTokenReturnsNonEmptyString(): void
    {
        $endpoint = getenv('CLUSTER_ENDPOINT');
        $region   = getenv('REGION') ?: 'us-east-1';

        $this->assertNotEmpty($endpoint, 'CLUSTER_ENDPOINT environment variable must be set');

        $token = generateToken($endpoint, $region);

        $this->assertIsString($token);
        $this->assertNotEmpty($token);
    }

    public function testTokenCanConnectToCluster(): void
    {
        $endpoint = getenv('CLUSTER_ENDPOINT');
        $region   = getenv('REGION') ?: 'us-east-1';

        $this->assertNotEmpty($endpoint, 'CLUSTER_ENDPOINT environment variable must be set');

        $token = generateToken($endpoint, $region);

        $dsn = "pgsql:host={$endpoint};port=5432;dbname=postgres;sslmode=verify-full;sslrootcert=system";
        $pdo = new PDO($dsn, 'admin', $token);

        $stmt   = $pdo->query('SELECT 1 AS result');
        $result = $stmt->fetchColumn();

        $this->assertEquals(1, (int) $result);
    }
}
