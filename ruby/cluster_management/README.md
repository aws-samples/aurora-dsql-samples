# Aurora DSQL Ruby code examples

## Overview

The code examples in this topic show you how to use the AWS Ruby SDK with DSQL
to create, update, get, and delete single- and multi-Region clusters.

Each file in the [/lib](lib) directory demonstrates a minimal
working example for each operation. The example function for each operation is invoked
in [`dsql_cluster_management_spec.rb`](spec/dsql_cluster_management_spec.rb).

## Run the examples

### ⚠️ Important

* Running this code might result in charges to your AWS account.
* We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
* This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

### Prerequisites

- Ruby version >= 3.3 is installed.
  - **MacOS Optional:** Use rbenv to manage Ruby version

```bash
# Optional use rbenv
rbenv install 3.3.5
rbenv local 3.3.5

ruby --version
```

- Valid AWS credentials can be discovered by
  the [default provider chain](https://docs.aws.amazon.com/sdk-for-ruby/v3/developer-guide/credential-providers.html).

### Execute tests to create and delete clusters

```sh
# Optional: Single-Region examples will execute in CLUSTER_REGION. Defaults to 'us-east-1'.
export CLUSTER_REGION="us-east-1"

# Optional: Multi-Region examples will create clusters in CLUSTER_1_REGION and CLUSTER_2_REGION
# with WITNESS_REGION as witness for both. Defaults to 'us-east-1' for CLUSTER_1_REGION, 'us-east-2' 
# for CLUSTER_2_REGION and 'us-west-2' for WITNESS_REGION.
export CLUSTER_1_REGION="us-east-1"
export CLUSTER_2_REGION="us-east-2"
export WITNESS_REGION="us-west-2"

bundle install

# Will create, update, read, then delete clusters
rspec
```

Test execution will take around five minutes as it waits for clusters to complete activation and deletion.

### Executing single operations

Files in [lib/](lib/) each have a `main()` function that let you exercise single operations.

```shell
# Check each operation for its expected environment variables
CLUSTER_REGION="us-east-1" CLUSTER_ID="<your cluster id>" \
  ruby lib/create_single_region_cluster.rb
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
