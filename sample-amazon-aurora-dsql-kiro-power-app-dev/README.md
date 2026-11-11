# Application development with the Amazon Aurora DSQL Kiro power

AI coding agents can shorten the path from source data and business requirements to a working application when they receive current, service-specific context. This prompt package uses Kiro as the agentic IDE and the Amazon Aurora DSQL Kiro power for service-specific guidance and Aurora DSQL MCP server configuration.

The manufacturing material-control and lot-genealogy scenario demonstrates a reusable source-data-to-application pattern rather than prescribing one domain. The walkthrough is local, uses synthetic data, and is intended only for development or sandbox environments. Generated architecture, code, permissions, security, performance, and operations require human review and testing; the power does not validate, certify, prove, or guarantee them.

## What this sample contains

- [`reader-prompts.md`](reader-prompts.md): four prompts in Markdown.
- [`reader-prompts.html`](reader-prompts.html): the same prompts with browser copy buttons. This convenience page is not the generated application.

## Before you begin

This prompt-only folder contains only `README.md`, `reader-prompts.md`, and `reader-prompts.html`. It does not include a `workspace/` directory, source `data/`, checksum files, a validator, `scripts/cleanup_demo.sh`, generated source, or evidence. The sample is not independently runnable.

Do not run Prompts 2–4 until you have prepared a separate Kiro workspace containing the inputs and safety scripts referenced by those prompts. Keep the prompt files outside the separate workspace that you open in Kiro so the agent works only with the prepared inputs and scripts.

## Prerequisites

- [Kiro](https://kiro.dev/).
- The **Build applications with Aurora DSQL** power, installed after Prompt 1.
- An AWS development or sandbox account, least-privilege temporary credentials, AWS CLI v2, Python 3.12 or later, a browser and shell, and network access to the required AWS endpoints, PyPI, and GitHub.
- A prepared, separate workspace containing the source data, validator and checksums, and cleanup script referenced by the prompts.
- Review [Aurora DSQL pricing](https://aws.amazon.com/rds/aurora/dsql/pricing/) before creating resources. The walkthrough can incur AWS charges.

## Walkthrough flow

Use the four prompts in order in one saved Kiro chat:

1. Run Prompt 1 for a read-only database recommendation.
2. Install and activate the **Build applications with Aurora DSQL** power.
3. Run Prompt 2 and provide one consolidated `Approved` response. It creates and configures the data layer: one tagged development cluster, a read-only workspace MCP connection, the schema and roles, and the data load.
4. Run Prompt 3 and provide one consolidated `Approved` response. It generates and tests the local application, performs deterministic synthetic demonstration writes, and listens only on `127.0.0.1:8000`.
5. Run Prompt 4 in check mode first. To authorize deletion, separately enter the exact recorded cluster ID when the cleanup script asks for confirmation.

Kiro tool-permission dialogs may appear separately from the consolidated approvals.

## Safety boundaries

- Use a development or sandbox account and least-privilege temporary credentials. Verify the active AWS identity before making changes, and leave existing clusters untouched.
- Never publish credentials, account IDs, ARNs, endpoints, or profile names.
- Keep the workspace MCP connection read-only. Perform writes only through direct IAM-authenticated scripts or the Loader.
- The generated application is loopback-only and has no sign-in. Its view selector is not an authorization control.
- The generated application writes only through a restricted role. Do not put MCP or administrative access in its runtime path.
- Cluster cleanup is irreversible. Do not run it without the referenced, verified cleanup script.
- Human review and testing are required before adapting generated architecture, code, permissions, security, performance, or operations for production.

## Cleanup

Prompt 4 runs the cleanup script in check mode first so you can inspect the target. The script then requires the exact recorded cluster ID before deletion. Cluster deletion and its data loss are irreversible.

The cleanup script is not included in this prompt-only folder. Do not attempt cleanup until the referenced script is present and verified in the separate workspace.

## Related resources

- [Aurora DSQL steering: Plugins, skills, and powers](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/SECTION_aurora-dsql-steering.html)
- [AWS Labs Aurora DSQL MCP server](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/SECTION_aurora-dsql-mcp-server.html)
- [Aurora DSQL IAM documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/security-iam.html)
- [Kiro](https://kiro.dev/)

## Security issue notifications

See [CONTRIBUTING](../CONTRIBUTING.md#security-issue-notifications) for reporting security issues.

## License

This project is licensed under the MIT-0 License. See the [LICENSE](../LICENSE) file.
