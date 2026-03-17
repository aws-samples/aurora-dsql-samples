// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

using Amazon.AuroraDsql.Npgsql.Examples.Alternatives;
using Xunit;

namespace Amazon.AuroraDsql.Npgsql.Examples.Tests.Alternatives;

[Collection("ExampleTests")]
public class ManualTokenExampleTest
{
    [Fact]
    public async Task RunExample()
    {
        var endpoint = Environment.GetEnvironmentVariable("CLUSTER_ENDPOINT")
            ?? throw new InvalidOperationException("CLUSTER_ENDPOINT environment variable is required.");
        _ = Environment.GetEnvironmentVariable("CLUSTER_USER")
            ?? throw new InvalidOperationException("CLUSTER_USER environment variable is required.");
        _ = Environment.GetEnvironmentVariable("REGION")
            ?? throw new InvalidOperationException("REGION environment variable is required.");

        await ManualTokenExample.RunAsync(endpoint);
    }
}
