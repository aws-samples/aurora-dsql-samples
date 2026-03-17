// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

using Amazon.AuroraDsql.Npgsql.Examples;
using Xunit;

namespace Amazon.AuroraDsql.Npgsql.Examples.Tests;

[Collection("ExampleTests")]
public class ExamplePreferredTest
{
    [Fact]
    public async Task RunExample()
    {
        var endpoint = Environment.GetEnvironmentVariable("CLUSTER_ENDPOINT")
            ?? throw new InvalidOperationException("CLUSTER_ENDPOINT environment variable is required.");

        await ExamplePreferred.RunAsync(endpoint);
    }
}
