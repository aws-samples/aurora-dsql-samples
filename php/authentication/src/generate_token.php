<?php
// PHP SDK examples for generating Aurora DSQL authentication tokens
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

require 'vendor/autoload.php';

// --8<-- [start:php-generate-token]
use Aws\DSQL\AuthTokenGenerator;
use Aws\Credentials\CredentialProvider;

function generateToken(string $yourClusterEndpoint, string $region): string
{
    $provider  = CredentialProvider::defaultProvider();
    $generator = new AuthTokenGenerator($provider);

    // Use generateDbConnectAuthToken if you are not connecting as admin
    $token = $generator->generateDbConnectAdminAuthToken($yourClusterEndpoint, $region);

    echo $token . PHP_EOL;
    return $token;
}
// --8<-- [end:php-generate-token]
