# Coding Guide — Rust Lambda + Aurora DSQL

Use this file as context when working with an AI coding assistant to build, modify, or deploy this project.

## Project Context

This is a serverless Employee Directory API using:
- **Rust** on AWS Lambda (ARM64/Graviton, `provided.al2023`)
- **Aurora DSQL** (serverless PostgreSQL-compatible, multi-Region active-active)
- **Aurora DSQL SQLx Connector** (`aurora-dsql-sqlx-connector` crate) for IAM auth + connection pooling
- **API Gateway HTTP API** for routing

## Key Technical Decisions

### Crate: `aurora-dsql-sqlx-connector` (not `aurora-dsql-sqlx`)
- The correct crate name is `aurora-dsql-sqlx-connector`
- Requires features: `["pool", "occ"]`
- Depends on `sqlx = "0.9"` (not 0.8 — version mismatch causes "multiple different versions of crate sqlx_core" errors)
- API: `DsqlConnectOptions::from_connection_string()` + `aurora_dsql_sqlx_connector::pool::connect_with()`
- Do NOT use `DsqlConnector::new()` — that API does not exist in the current version

### Connection Pool Pattern
```rust
use std::sync::OnceLock;  // NOT tokio::sync::OnceCell
static POOL: OnceLock<PgPool> = OnceLock::new();
```
- Use `std::sync::OnceLock` (simpler than async OnceCell for this pattern)
- Pool is initialized once, reused across warm Lambda invocations
- The connector handles token refresh (at 80% of duration) and connection recycling (before 60-min max lifetime) automatically

### Authentication
- Connect as a non-admin user (e.g., `app_readonly`) for least privilege
- The connector auto-detects: non-admin username → `db_connect_auth_token`, admin → `db_connect_admin_auth_token`
- IAM policy should use `dsql:DbConnect` (not `DbConnectAdmin`) for app roles
- Connection string format: `postgres://app_readonly@<endpoint>/postgres`

## Build & Deployment Pitfalls

### Apple Silicon (ARM Mac) Cross-Compilation
- **DO NOT** use `cargo lambda build --x86-64` or `--arm64` directly on macOS — native crypto crates (`aws-lc-sys`, `ring`) fail with zigbuild archiver errors
- **DO NOT** use `sam build --use-container` — the SAM container image lacks `cargo`/`cargo-lambda`
- **DO NOT** use `--compiler cross` — fails if Docker is not reachable
- **WORKING approach**: Build inside a Finch/Docker container manually:
  ```bash
  finch run --rm -v $(pwd):/code -w /code \
    public.ecr.aws/sam/build-provided.al2023:latest-arm64 \
    bash -c "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && \
    source \$HOME/.cargo/env && \
    pip3 install cargo-lambda && \
    cargo lambda build --release --arm64 --output-format binary"
  ```

### Binary Size — Lambda 250MB Limit
- Without optimization, Rust + crypto crates produce binaries >250MB (exceeds Lambda zip limit)
- **ALWAYS** include in `Cargo.toml`:
  ```toml
  [profile.release]
  strip = true
  lto = true
  opt-level = "z"
  ```
- With these settings, binary is ~7MB
- **IMPORTANT**: `[profile.release]` must be at the BOTTOM of Cargo.toml, after `[dependencies]`. If placed in the middle, all crates listed after it become invisible to the compiler.

### Container Image Deployment (Recommended)
- Use `--package-type Image` with ECR to bypass the 250MB zip limit entirely (10GB limit)
- Dockerfile:
  ```dockerfile
  FROM public.ecr.aws/lambda/provided:al2023-arm64
  COPY target/lambda/dsql-employee-lookup/bootstrap ${LAMBDA_RUNTIME_DIR}/bootstrap
  CMD ["bootstrap"]
  ```
- Deploy with: `--architectures arm64`

### Linux Native Build
- On Linux, `cargo lambda build --release --arm64 --output-format zip` works directly without containers

## AWS Best Practices

### IAM — Least Privilege
- Lambda execution role: scope `dsql:DbConnect` to the specific cluster ARN
- Do NOT use `dsql:DbConnectAdmin` for application workloads
- Set up database roles:
  ```sql
  CREATE ROLE app_readonly WITH LOGIN;
  AWS IAM GRANT app_readonly TO '<lambda-execution-role-arn>';
  GRANT SELECT ON employees TO app_readonly;
  ```

### API Gateway
- Always set `authorization_type` on routes (AWS_IAM, JWT, or CUSTOM) — never leave as NONE in production
- Enable access logging on all stages with structured JSON format
- CloudWatch log retention must be ≥ 365 days for compliance

### Aurora DSQL Specifics
- DSQL has a 60-minute maximum connection lifetime — the connector handles recycling automatically
- Token duration defaults to 900 seconds (15 min) — connector refreshes at 80%
- DSQL uses optimistic concurrency control (OCC) — transactions may fail with SQL state `40001`
- OCC retry: `retry_on_occ` / `transaction_with_retry()` re-executes the entire closure — closures must contain ONLY database operations (no side effects like sending emails)
- `LOWER(name) LIKE LOWER($1)` cannot use standard B-tree indexes (sequential scan)
- DSQL does not support `pg_trgm` — do not suggest trigram indexes
- `%` and `_` in user input act as LIKE wildcards — escape them for exact matching

### Error Handling
- Never use `unwrap_or_default()` on request body parsing — return 400 with error details
- Handle `Body::Binary` explicitly (real API Gateway case, not just `Body::Text`)
- Use `row.get("column_name")` (named) instead of `row.get(0)` (positional) — positional breaks if SELECT column order changes
- Declare columns NOT NULL to prevent runtime panics from unexpected NULLs

## Security Scan Requirements (for aws-samples contribution)

Before pushing to a public repo:

1. **git-secrets**: `git secrets --register-aws && git secrets --scan`
2. **trufflehog**: `trufflehog filesystem . --no-update` (exclude `target/` — findings there are false positives from compiled deps)
3. **cargo audit**: `cargo audit` (requires `Cargo.lock` — generate with `cargo generate-lockfile`)
4. **cargo license**: Verify all deps are MIT/Apache-2.0/BSD compatible (no GPL/AGPL)
5. **No squattable S3 bucket names**: Use `<YOUR_BUCKET>` placeholders, not `service-name-artifacts-<ACCOUNT_ID>`
6. **CloudWatch log retention**: Must be ≥ 365 days in Terraform/CloudFormation
7. **API Gateway auth**: Routes must specify `authorization_type`
8. **No hardcoded values**: Account IDs, endpoints, ARNs must be parameterized
9. **Sample data**: Use `@example.com` (IANA-reserved), clearly fictional names

## File Structure Reference

```
├── src/main.rs           # Lambda handler + DSQL connection pool
├── Cargo.toml            # Dependencies (aurora-dsql-sqlx-connector 0.2, sqlx 0.9)
├── Dockerfile            # Container image for Lambda
├── seed.sql              # DB schema + sample data
├── deploy/
│   ├── container/        # Container image deployment (recommended)
│   │   ├── setup.sh      # AWS CLI script
│   │   ├── cloudformation.yaml
│   │   └── main.tf       # Terraform
│   └── zip/              # Zip deployment (250MB limit applies)
│       ├── setup.sh
│       ├── cloudformation.yaml
│       └── main.tf
├── setup-finch.sh        # macOS (Finch) build + deploy
└── setup-docker.sh       # macOS (Docker) build + deploy
```

## Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `no matching package named aurora-dsql-sqlx` | Wrong crate name | Use `aurora-dsql-sqlx-connector` |
| `multiple different versions of crate sqlx_core` | sqlx version mismatch | Bump to `sqlx = "0.9"` |
| `ar: error: unable to open ... libaws_lc_0_44_0_crypto.a` | Cross-compilation on macOS | Build inside Finch/Docker container |
| `Unzipped size must be smaller than 262144000 bytes` | Binary too large for zip | Add `[profile.release]` strip+lto, or use container image |
| `[profile.release]` crates invisible | Section placed mid-dependencies | Move `[profile.release]` to bottom of Cargo.toml |
| `RustCargoLambdaBuilder:Resolver - Path resolution ... not successful` | SAM container lacks cargo | Don't use `sam build --use-container`; use Finch directly |
| `--deletion-protection-enabled false` error | CLI boolean flag syntax | Use `--no-deletion-protection-enabled` |

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
