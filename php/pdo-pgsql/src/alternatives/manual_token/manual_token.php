<?php

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

declare(strict_types=1);

/**
 * Manual token generation example — uses raw PDO + AWS SDK directly.
 * Use this approach when you need custom token logic or want to understand
 * the underlying mechanism the connector automates.
 */

require_once __DIR__ . '/../../../vendor/autoload.php';

use Aws\Credentials\CredentialProvider;
use Aws\DSQL\AuthTokenGenerator;

function main(): void
{
    $clusterEndpoint = getenv('CLUSTER_ENDPOINT') ?: throw new RuntimeException(
        'CLUSTER_ENDPOINT environment variable is required'
    );

    // Extract region from hostname
    preg_match('/\.dsql[^.]*\.([^.]+)\.on\.aws$/', $clusterEndpoint, $matches);
    $region = $matches[1] ?? getenv('AWS_REGION') ?: throw new RuntimeException(
        'Cannot determine region from endpoint'
    );

    // Generate IAM auth token
    $credentials = CredentialProvider::defaultProvider();
    $generator = new AuthTokenGenerator($credentials);
    $token = $generator->generateDbConnectAdminAuthToken($clusterEndpoint, $region);

    // Build DSN with SSL enforcement
    $dsn = sprintf(
        'pgsql:host=%s;port=5432;dbname=postgres;sslmode=verify-full',
        $clusterEndpoint
    );

    // Connect
    $pdo = new PDO($dsn, 'admin', $token, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    $stmt = $pdo->query('SELECT 1 AS result');
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    echo "Connected successfully. SELECT 1 = {$row['result']}\n";
}

main();
