<?php

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Aws\AuroraDsql\PdoPgsql\AuroraDsql;
use Aws\AuroraDsql\PdoPgsql\DsqlConfig;

function main(): void
{
    $clusterEndpoint = getenv('CLUSTER_ENDPOINT') ?: throw new RuntimeException(
        'CLUSTER_ENDPOINT environment variable is required'
    );

    $config = new DsqlConfig(
        host: $clusterEndpoint,
        occMaxRetries: 3,
    );
    $pdo = AuroraDsql::connect($config);

    // Simple read
    $stmt = $pdo->query('SELECT 1 AS result');
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    echo "Connected successfully. SELECT 1 = {$row['result']}\n";

    // Create a test table — exec() is automatically retried on OCC conflict
    $pdo->exec('CREATE TABLE IF NOT EXISTS example_test (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
    )');

    // Transactional write — transaction() is automatically retried on OCC conflict
    $name = 'test-' . bin2hex(random_bytes(4));
    $id = $pdo->transaction(function (PDO $conn) use ($name): string {
        $stmt = $conn->prepare('INSERT INTO example_test (name) VALUES (?) RETURNING id');
        $stmt->execute([$name]);
        return $stmt->fetchColumn();
    });

    echo "Inserted row with id: {$id}\n";

    // Read it back
    $stmt = $pdo->prepare('SELECT name FROM example_test WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    echo "Read back: {$row['name']}\n";

    // Cleanup — exec() retry handles OCC conflicts transparently
    $pdo->exec('DELETE FROM example_test');
    echo "Done.\n";
}

main();
