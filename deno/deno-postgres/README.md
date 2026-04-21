# Aurora DSQL with deno-postgres

## Overview

This code example demonstrates how to use the native `deno-postgres` driver (`jsr:@db/postgres`) with
Amazon Aurora DSQL from Deno. The example shows you how to connect to an Aurora DSQL cluster using IAM
token authentication over SSL and run concurrent queries.

Aurora DSQL is a distributed SQL database service that provides high availability and scalability for
your PostgreSQL-compatible applications. `deno-postgres` is a native PostgreSQL driver for Deno that
uses Deno's built-in TLS stack for secure connections — no Node.js compatibility layer needed.

## About the code example

The example uses `@aws-sdk/dsql-signer` (via `npm:` specifier) to generate short-lived IAM authentication
tokens. It demonstrates:

* Connecting to Aurora DSQL with IAM token auth and SSL verify-full
* Running concurrent queries across multiple connections
* Support for both admin and non-admin users

Unlike Node.js samples, Deno runs TypeScript natively — no build step, no `node_modules`, no `package.json`.
Just `deno task start`.

## ⚠️ Important

* Running this code might result in charges to your AWS account.
* We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
* This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

## Run the example

### Prerequisites

* You must have an AWS account, and have your default credentials and AWS Region
  configured as described in the
  [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html)
  guide.
* Deno 2.x or later installed.

```bash
deno --version
```

* You must have an Aurora DSQL cluster. For information about creating an Aurora DSQL cluster, see the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
  guide.

### Run the code

Set environment variables for your cluster details:

```bash
# e.g. "admin"
export CLUSTER_USER="<your user>"

# e.g. "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
export CLUSTER_ENDPOINT="<your endpoint>"
```

Run the example:

```bash
deno task start
```

The example connects to Aurora DSQL, runs 8 concurrent queries to verify connectivity, and prints the
results. No prior `npm install` or build step is required — Deno resolves dependencies on first run.

## Additional resources

* [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
* [deno-postgres Documentation](https://deno-postgres.com/)
* [Deno Manual](https://docs.deno.com/)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
