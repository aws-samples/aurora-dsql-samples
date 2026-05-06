# Aurora DSQL with postgres.js from Deno

## Overview

This code example demonstrates how to use the [Aurora DSQL Connector for
Postgres.js](https://github.com/awslabs/aurora-dsql-connectors/tree/main/node/postgres-js)
from Deno. The connector wraps the `postgres` (postgres.js) driver with
automatic IAM token generation and refresh; Deno loads the connector via its
`npm:` specifier with no extra setup.

Aurora DSQL is a distributed SQL database service that provides high
availability and scalability for your PostgreSQL-compatible applications. The
connector handles the DSQL-specific parts (IAM auth, SSL, token lifetime) so
the sample code stays focused on querying.

## About the code example

The example uses `@aws/aurora-dsql-postgresjs-connector` to create a pooled
`sql` client and run concurrent queries. It demonstrates:

* Connecting to Aurora DSQL with IAM token auth and SSL (connector defaults)
* Automatic token refresh inside the connection pool
* Running concurrent queries across a shared pool
* Admin vs non-admin credential selection via the `user` option

Unlike Node.js samples, Deno runs TypeScript natively — no build step, no
`node_modules`, no `package.json`. Just `deno task start`.

## ⚠️ Important

* Running this code might result in charges to your AWS account.
* We recommend that you grant your code least privilege. At most, grant only
  the minimum permissions required to perform the task. For more information,
  see [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
* This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

## Run the example

### Prerequisites

* You must have an AWS account, and have your default credentials and AWS
  region configured as described in the
  [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html)
  guide.
* Deno 2.x or later installed.

```bash
deno --version
```

* You must have an Aurora DSQL cluster. For information about creating an
  Aurora DSQL cluster, see the
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

The example connects to Aurora DSQL, runs 8 concurrent queries through the
shared pool, and prints the results. Deno downloads the connector and its
transitive AWS SDK dependencies on first run.

## Additional resources

* [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
* [Aurora DSQL Connectors (multi-language monorepo)](https://github.com/awslabs/aurora-dsql-connectors)
* [postgres.js](https://github.com/porsager/postgres)
* [Deno Manual](https://docs.deno.com/)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
