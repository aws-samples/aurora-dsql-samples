# Tortoise ORM + Amazon Aurora DSQL: Rideshare Application

This sample demonstrates how to build an async Python application using [Tortoise ORM](https://tortoise.github.io/) with [Amazon Aurora DSQL](https://aws.amazon.com/rds/aurora/dsql/).

## What it demonstrates

- Tortoise ORM models with UUID primary keys for Aurora DSQL's distributed architecture
- Application-level relationships using UUID columns (Aurora DSQL does not enforce foreign key constraints)
- IAM authentication via boto3's DSQL client (no static passwords)
- asyncpg connection pool patching for Aurora DSQL compatibility
- Optimistic concurrency control (OCC) retry logic with exponential backoff and jitter
- Individual DDL execution (Aurora DSQL does not support multiple DDL per transaction)

## Prerequisites

- Python 3.10 or later
- AWS CLI v2 configured with credentials
- An Aurora DSQL cluster (single-Region is sufficient)
- IAM permissions: `dsql:DbConnectAdmin` and `dsql:DbConnect` on your cluster

## Setup

```bash
cd aurora-dsql-samples/python/tortoise-orm
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Configuration

Set the following environment variables:

```bash
export CLUSTER_ENDPOINT="your-cluster.dsql.your-region.on.aws"
export CLUSTER_REGION="your-region"   # e.g., us-east-1
export CLUSTER_USER="admin"           # required — see below for recommended non-admin setup
```

## Run (initial setup — admin)

Admin access is needed only for one-time schema and role creation. After setup, use the non-admin app user (recommended below).

```bash
cd src/

# Test connectivity first
python test_connection.py

# Run the full demo (creates schema + tables + demo data)
python riders_app.py

# After reviewing the data in your database, clean up
python cleanup.py
```

## Running tests

```bash
# Run from project root (aurora-dsql-samples/python/tortoise-orm), not src/
python -m pytest
```

## Running as a non-admin app user (recommended for production)

For production workloads, use a least-privilege app user instead of admin. This is the recommended path after initial setup.

In Aurora DSQL, every non-admin database user maps 1:1 to an IAM identity — the IAM ARN is the database role name. The simplest approach is to use your existing IAM user directly.

**Note:** This step requires an IAM user with permissions to create IAM policies and modify Aurora DSQL cluster access. If your current user lacks these permissions, ask your AWS account administrator.

### 1. Ensure your IAM user has `dsql:DbConnect`

Your IAM policy should include both actions:

```json
{
    "Sid": "DatabaseAccess",
    "Effect": "Allow",
    "Action": [
        "dsql:DbConnectAdmin",
        "dsql:DbConnect"
    ],
    "Resource": "arn:aws:dsql:<region>:<account-id>:cluster/<cluster-id>"
}
```

### 2. Create the database role and schema (run once as admin)

Edit `src/setup_app_user.sql` — replace `<AWS_ACCOUNT_ID>` and `<IAM_USERNAME>` with your values, then run:

```bash
# Generate admin auth token
TOKEN=$(aws dsql generate-db-connect-admin-auth-token \
  --hostname $CLUSTER_ENDPOINT \
  --region $CLUSTER_REGION \
  --expires-in 3600)

# Run the SQL file to create the role, schema, and permissions
psql "host=$CLUSTER_ENDPOINT port=5432 dbname=postgres user=admin sslmode=require password=${TOKEN}" \
  -f src/setup_app_user.sql
```

### 3. Configure the app to use the non-admin user

```bash
export CLUSTER_USER="rideshare_app"
export CLUSTER_SCHEMA="rideshare"
```

For example, if your AWS account ID is `111222333444` and your IAM user is `jdoe`:

```bash
# In setup_app_user.sql, the AWS IAM GRANT line would be:
# AWS IAM GRANT rideshare_app TO 'arn:aws:iam::111222333444:user/jdoe';

export CLUSTER_USER="rideshare_app"
export CLUSTER_SCHEMA="rideshare"
```

### 4. Run the app

```bash
cd src/

# Test connectivity with the app user
python test_connection.py

# Run the full demo
python riders_app.py

# After reviewing the data, clean up
python cleanup.py
```

The code automatically selects the correct token method:
- `admin` → `generate_db_connect_admin_auth_token()` (requires IAM `dsql:DbConnectAdmin`)
- Any other user → `generate_db_connect_auth_token()` (requires IAM `dsql:DbConnect`)

No `sts:AssumeRole` is required — the same IAM credentials that authenticate the AWS API call are linked to the database role via `AWS IAM GRANT`.

### Advanced: Using an IAM role (for production compute)

If your production architecture uses IAM roles (EC2 instance profiles, ECS task roles, Lambda execution roles), create a dedicated IAM role with `dsql:DbConnect` permission scoped to your cluster. The same database linking pattern applies — use `CREATE ROLE` with a simple name, then `AWS IAM GRANT` to map it to the IAM role ARN, and `GRANT` the schema permissions. See the "Advanced" section in `src/setup_app_user.sql` for an example.

## Project structure

```
.
├── pyproject.toml          # Project metadata and pytest configuration
├── requirements.txt        # Python dependencies
├── .gitignore
├── README.md
├── src/
│   ├── __init__.py
│   ├── rider_models.py     # Tortoise ORM model definitions (Rider, Driver, Ride, Payment)
│   ├── rider_config.py     # Aurora DSQL connection setup, IAM auth, schema creation
│   ├── retry.py            # OCC retry utility with exponential backoff and jitter
│   ├── riders_app.py       # Main rideshare demonstration application
│   ├── cleanup.py          # Remove demo data (run separately after reviewing)
│   ├── test_connection.py  # Quick connectivity verification
│   └── setup_app_user.sql  # SQL commands to create a non-admin app user
└── test/
    └── test_example.py     # Unit tests (config, models, retry)
```

## Key Aurora DSQL adaptations

1. **UUID primary keys**: `fields.UUIDField(primary_key=True, default=uuid.uuid4)`
2. **asyncpg patch**: `Connection.reset` replaced with narrowed reset (`RESET ALL`) to avoid unsupported `pg_advisory_unlock_all()`
3. **Raw DDL execution**: Each `CREATE TABLE` runs individually via raw asyncpg connection
4. **OCC retry**: Catches `SQLSTATE 40001` and retries with backoff + jitter

## Security

- No static passwords — IAM tokens are generated at runtime via boto3
- TLS required for all connections to Aurora DSQL
- Tokens expire after 15 minutes; regenerate for long-running applications

## Related

- [Aurora DSQL User Guide](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
- [Tortoise ORM Documentation](https://tortoise.github.io/)
