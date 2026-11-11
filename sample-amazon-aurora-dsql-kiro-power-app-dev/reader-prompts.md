# Aurora DSQL material-control reader prompts

Use these four prompts in one saved Kiro chat. Copy only the text inside each code block.

## Step 1: Ask Kiro to recommend a database

### Prompt 1

```text
Using the synthetic extracts in `data/`, recommend an AWS database for a material-control and lot-genealogy application used by a US assembly plant, a Mexico assembly plant and a central planning team.

The application must provide one shared relational data set. A quality hold must immediately block reservation and issue at both plants. Reads and writes must continue through an Availability Zone failure without a failover action. The team wants no database servers, capacity settings, maintenance windows or database upgrade scheduling. Costs should fall substantially during idle weekends; disclose any first-connection behavior after idle. Commands change several related rows atomically. Existing tools use PostgreSQL drivers. For this application, all database users, including administrators, must authenticate with AWS Identity and Access Management (IAM); database passwords aren't allowed.

Compare the best recommendation with Aurora PostgreSQL Serverless v2 and RDS for PostgreSQL Multi-AZ. For each candidate, verify from current official AWS API documentation whether the administrator user can use IAM database authentication without retaining a database password. Treat opt-in support as meeting the requirement, but state the required configuration. Use current official AWS documentation for all deciding claims.

Keep the answer under 450 words. Include one short comparison table, the main trade-offs, business rules, screens, assumptions and open questions. Do not create files, install software, inspect my AWS account or create resources. Stop after the recommendation.
```

## Step 2: Install the Aurora DSQL power

In Kiro, open the powers pane, search for **Build applications with Aurora DSQL**, and install it. Kiro activates the installed power automatically when a relevant prompt requires it. You can also find it in the Kiro powers registry. This is the only tool you install manually. You don't need to install the MCP server separately; Prompt 2 creates a workspace-scoped connection that runs a pinned version of the same server package.

If Kiro asks for a reload after it writes the workspace MCP configuration, reload Kiro, reopen the same saved chat, and continue the already approved batch.

## Step 3: Build the data layer

### Prompt 2

```text
Build the complete Aurora DSQL data layer for the material-control demonstration in this workspace, using only the synthetic extracts under `data/`.

Approval contract:

- First perform only local validation and read-only AWS discovery.
- Present one consolidated plan covering every file, dependency, AWS resource, database change, load operation and verification in this prompt.
- Wait once for my explicit `Approved` response.
- That single approval covers all listed workspace files, dependency installations, cluster creation, and direct database setup scripts. It also covers the schema statements, IAM database mappings, data loading, waits, and verification described in the plan.
- After approval, do not pause again for an individual file, command, SQL statement, index, role, grant, installation, wait or test already included in the plan.
- Stop and ask again only if the AWS identity or target differs, scope expands, a new resource is needed, a destructive action becomes necessary, or an unexpected result occurs.
- Use the following defaults instead of presenting optional design decisions. Do not ask me to approve generated requirements or design files separately; validate them and continue within this batch.
- Cleanup is outside this approved batch and requires separate confirmation after the application has been explored.

Before approval, validate the dataset checksums and validator, confirm the active AWS identity without printing it, inventory Aurora DSQL clusters in `us-east-1` and confirm none is already tagged `Purpose=material-control-demo`; leave every existing cluster untouched; and confirm the Build applications with Aurora DSQL power is active.

The approved batch must do all of the following:

1. Create one single-Region Aurora DSQL cluster in `us-east-1`. Enable deletion protection and use the AWS-owned encryption key. Add these tags: `Purpose=material-control-demo`, `DataClassification=synthetic`, `Environment=development`, and `Owner=blog-walkthrough`. Use a fixed client token and verify the final state.
2. Store the cluster ID, Region, identity fingerprint and AWS profile alias only in owner-readable, git-ignored `.private/` files required by `scripts/cleanup_demo.sh`. Never print their values into evidence.
3. Create `.kiro/settings/mcp.json` with one workspace server named `mc-dev-dsql-readonly`, pinned to `awslabs.aurora-dsql-mcp-server@1.1.4`, connecting as `admin` with no `--allow-writes`. If Kiro must reload to activate it, ask only for the reload, reopen this chat and continue the already approved batch without requesting approval again. Verify a harmless read query.
4. Keep MCP read-only. Use direct scripts with IAM tokens for approved database writes. Use TLS hostname verification with an explicit trusted CA bundle. Capture command failures privately and show only redacted errors.
5. Create a concise requirements and design record plus restart-safe migrations. Aurora DSQL DDL statements run separately, secondary indexes use `CREATE INDEX ASYNC`, and a migration with an unknown commit result is reconciled from the catalog rather than blindly repeated. Do not inject failures or build an exhaustive recovery-test matrix.
6. Create schema `mc` with the 11 extract tables plus `material_requirement`, `material_reservation`, `command_request` and `initial_load_finalization`. Add `mc_meta.migration_ledger`.
7. Use `inventory_lot` as the shared lot control row for reserve, issue and hold. Use one `material_requirement` row per work order and BOM line as the shared requirement control row for reserve, cancel and issue. Maintain the lot reserved total and the requirement issued/open-reserved totals transactionally.
8. Store an idempotency key and SHA-256 request fingerprint in the same transaction as each successful command. Retry only `40001` by restarting the whole transaction. A reused key with different input is a business conflict. Roll back before reading after `23505`.
9. Create database roles `mc_loader`, `mc_runtime` and `mc_readonly`. Grant `mc_runtime` only the writes used by the application: `UPDATE` on `inventory_lot`; `INSERT` and `UPDATE` on `quality_hold`; `INSERT` on `material_issue`; `UPDATE` on `material_requirement`; `INSERT` and `UPDATE` on `material_reservation`; and `INSERT` on `command_request`. Do not grant it writes on `work_order_output`, `lot_genealogy_edge`, master-data tables, `initial_load_finalization` or the migration ledger. It must have no `DELETE`, `TRUNCATE`, schema `CREATE` or grant options. Validate the live grants against this exact list. Map the one walkthrough IAM principal to all three roles as a documented demo simplification. Production should use separate IAM principals.
10. Use Aurora DSQL Loader v3.3.0 for the canonical load. Verify its release asset by published SHA-256; do not use `--version` as a gate. Account for positional column mapping by generating deterministic loader-compatible copies under `build/` while leaving `data/` unchanged. Use one worker and strict error-on-conflict behavior. Do not claim that loader dry-run or CSV full verification proves authentication, source counts or values. Do not claim the loader verifies server certificates unless that mode is independently proven.
11. Independently check the files against the live schema before loading. Load all 39 canonical rows. In one guarded initial-load finalization transaction as `admin`, set the two delivered open-hold counts and create exactly nine material-requirement rows. The transaction must refuse a rerun or any existing runtime activity.
12. Verify all 39 rows by key and normalized value, the nine requirement rows, the lot and requirement totals, the expected genealogy chain and the exact role grants. Include rollback-only checks showing that `mc_runtime` cannot change master data, write `work_order_output` or `lot_genealogy_edge`, write the finalization or migration ledger, delete rows or create schema objects. Confirm all indexes are valid and run `bash scripts/cleanup_demo.sh --check`. Check mode may append its redacted report but must not change AWS, the database, processes or MCP configuration.

Write one redacted summary to `evidence/data-layer-summary.md`. Do not create dozens of evidence files or exhaustive check matrices. Finish with either `DATA LAYER READY` or a specific stopped condition.
```

## Step 4: Build and demonstrate the application

### Prompt 3

```text
Build and demonstrate the local material-control application against the verified data layer.

Approval contract:

- Verify the data-layer preconditions read-only.
- Present one consolidated plan for application files, dependencies, tests, demonstration writes and process start.
- Wait once for `Approved`.
- That approval covers every listed application file, dependency install, test, synthetic database write, demonstration script and local process start.
- Do not ask again for an individual file, package, test, command, page or synthetic write already listed.
- Use the following implementation defaults instead of presenting optional design choices. Do not ask for separate approval of generated application files or tests.
- Stop only for a changed identity or target, expanded scope, destructive action or unexpected result.

After approval:

1. Create a minimal server-rendered FastAPI application in `mcapp/` and start exactly `uvicorn mcapp.web:app --host 127.0.0.1 --port 8000`.
2. Show a persistent notice that this is a loopback-only synthetic demonstration with no sign-in and not production guidance. Treat the planner, warehouse and quality selector as a view selector, not authorization. Reject foreign Host headers and cross-origin writes.
3. Connect directly to Aurora DSQL as `mc_runtime` using IAM tokens and TLS hostname verification. Application requests must never use `admin` or MCP.
4. Implement work orders and requirement lines, eligible lots, reserve, cancel, issue, quality hold/release, reservation review and lot genealogy.
5. Preserve the approved transaction design: shared lot and requirement control rows, full-transaction retry only for `40001`, stable idempotency keys and no blind retry of business conflicts.
6. Discard closed, broken or over-age pooled connections. A read-only page query may retry once on a fresh connection after a connection-level failure. Writes must never use that read retry path.
7. Before testing, verify that the operational history tables are empty and that the canonical lot and requirement totals still match the data-layer summary. Add a focused test suite covering database permissions, idempotency, whole-transaction retry, stale-read recovery, Host and Origin guards and the core application screens. Tests must use unit fakes, read-only checks or transactions that are always rolled back. After the suite, prove that no reservation, hold, issue, command-request or inventory total was added or changed. Do not run the committed two-session conflict scenario in the test suite; step 9 is its only live execution. Prove denied writes to master data, `work_order_output`, `lot_genealogy_edge`, initial-load finalization, row deletion and schema creation return `42501` and are rolled back.
8. Run one deterministic HTTP demonstration using fixed scenario names and UUIDv5 idempotency keys, never timestamps or random keys. For `WO-MX-2001` and component `CMP-CTRL-10`, reserve and issue exactly 8 units from `LOT-CTRL-MX-261012-A`. Place and release exactly one `INSPECTION` hold with reason `DEMO_RECHECK` on `LOT-HOUS-US-261014-A`. Trace `LOT-CTRL-US-260925-Z` through `WO-US-0990` to `LOT-FG-US-261008-01`. If this approved step is resumed after an interruption, reuse the same keys and stored results; never create replacement history rows.
9. Run the deterministic two-session conflict demonstration exactly once in each commit order on `LOT-CTRL-US-261015-A` and `WO-US-1001`, using fixed UUIDv5 idempotency keys. Prove both transactions overlap. The later committer must receive `40001`; the whole command retries once and then either commits the hold or returns `LOT_ON_HOLD`. Reset through the application commands. Do not run a second copy for tests or evidence.
10. Verify the final visible history is deterministic. Reservations must contain exactly one consumed 8-unit reservation for `WO-MX-2001` from `LOT-CTRL-MX-261012-A` and one cancelled 10-unit reservation for `WO-US-1001` from `LOT-CTRL-US-261015-A`. Holds must contain the two canonical open QMS holds, one released `DEMO_RECHECK` hold on `LOT-HOUS-US-261014-A`, and two released conflict holds on `LOT-CTRL-US-261015-A`. No `TEST_*` record may appear. Verify there are no open application reservations or holds, the conflict lot is reset to 10 on hand and 0 reserved, the Mexico control lot has 22 on hand, and all invariants hold. Any additional visible history is an unexpected result: stop instead of taking more actions.
11. Prove all committed demonstration commands used the exact `mc_runtime` grants. Redact endpoints, IP addresses, account identifiers and profile names from every displayed error and saved artifact.

Write one concise result to `evidence/application-summary.md`. Leave the app running and list the browser URLs for work orders, eligible lots, reservations, quality holds and genealogy. Tell me to open and explore those pages. Finish with `APPLICATION READY TO EXPLORE` or a specific stopped condition.
```

Open the listed URLs and explore the application. When you finish, continue with Prompt 4.

## Clean up

### Prompt 4

```text
The application review is complete. Clean up only the resources recorded by this reader run.

Inspect `scripts/cleanup_demo.sh`, parse it with `bash -n`, and run `bash scripts/cleanup_demo.sh --check`. Check mode may append redacted evidence but must not change AWS, the database, processes or MCP configuration. Stop on any identity, cluster, tag, application-process or workspace-MCP mismatch.

Do not create a multi-gate cleanup plan and do not ask me to approve deletion protection and deletion separately. Explain in a few lines that the script will stop only this workspace app, remove only `mc-dev-dsql-readonly`, disable deletion protection on the exact recorded cluster, delete that cluster and verify its absence. It must preserve the AWS profile, IAM principal, Aurora DSQL power, user-level Kiro MCP configuration, source, data and evidence.

Then tell me to run exactly:

`bash scripts/cleanup_demo.sh`

The script itself asks once for the exact cluster ID before changing anything. A wrong value must cancel with no changes. After I report completion, perform only read-only checks that the cluster, app listener and workspace MCP connection are absent and retained files remain. Use the script's redacted report as the cleanup evidence and finish with `CLEANUP COMPLETE` or a specific stopped condition.
```
