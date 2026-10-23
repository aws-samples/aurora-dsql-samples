# Makefile for the Flyway on Aurora DSQL sample.
#
# All targets expect AWS_REGION and DSQL_ENDPOINT to be set in the shell
# or in a local .env file (not committed).
#
# Precedence, highest first:
#   1. make DSQL_ENDPOINT=... <target>
#   2. an exported DSQL_ENDPOINT in your shell
#   3. .env
#
# Prefer `make help` to discover targets.

SHELL := /bin/bash
.DEFAULT_GOAL := help

# Capture what the environment already carries, because `include` below would
# otherwise take precedence over it. That default is surprising and dangerous
# here: `reset` and the test targets drop a schema, so pointing your shell at
# one cluster while .env names another must not silently resolve to .env.
#
# AWS_PROFILE belongs in this list too. It selects the credentials, so .env
# silently overriding the shell means a target can run against a different
# account than the one `aws sts get-caller-identity` just reported.
ENV_DSQL_ENDPOINT := $(DSQL_ENDPOINT)
ENV_AWS_REGION    := $(AWS_REGION)
ENV_AWS_PROFILE   := $(AWS_PROFILE)
ENV_DSQL_SCHEMA   := $(DSQL_SCHEMA)

ifneq (,$(wildcard .env))
include .env
export
endif

# Restore environment precedence over .env.
ifneq (,$(ENV_DSQL_ENDPOINT))
DSQL_ENDPOINT := $(ENV_DSQL_ENDPOINT)
endif
ifneq (,$(ENV_AWS_REGION))
AWS_REGION := $(ENV_AWS_REGION)
endif
ifneq (,$(ENV_AWS_PROFILE))
AWS_PROFILE := $(ENV_AWS_PROFILE)
endif
ifneq (,$(ENV_DSQL_SCHEMA))
DSQL_SCHEMA := $(ENV_DSQL_SCHEMA)
endif

# Every object this sample creates lives in one dedicated schema, so nothing
# here can collide with another sample's tables. See scripts/reset-db.sh.
DSQL_SCHEMA ?= flyway_sample

# AWS_PROFILE is deliberately absent from this list. Exporting it when it is
# unset would hand the SDK an empty profile name, which it treats as a request
# for a profile called "" rather than falling back to its provider chain. It
# is passed through by docker-compose.yml only when actually set.
export DSQL_ENDPOINT AWS_REGION DSQL_SCHEMA

COMPOSE := docker compose
RUN     := $(COMPOSE) run --rm flyway

.PHONY: help build info create-schema migrate repair validate reset \
        verify-schema reproduce-occ test test-happy test-occ clean

help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z0-9_-]+:.*?## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build the Docker image (Flyway CLI + Aurora DSQL module)
	$(COMPOSE) build

info: ## Show Flyway migration status against the configured cluster
	$(RUN) bash scripts/run-flyway.sh info

create-schema: ## Create the dedicated schema (required once before migrate)
	$(RUN) bash scripts/create-schema.sh

migrate: create-schema ## Apply pending migrations
	$(RUN) bash scripts/run-flyway.sh migrate

repair: ## Clear failed migrations from flyway_schema_history so retry can proceed
	$(RUN) bash scripts/run-flyway.sh repair

validate: ## Validate applied migrations against the migration files
	$(RUN) bash scripts/run-flyway.sh validate

verify-schema: ## Inspect the cluster: tables, flyway_schema_history, indexes
	$(RUN) bash scripts/verify-schema.sh

reset: ## Drop the sample's schema and everything in it (DANGEROUS; dev only)
	$(COMPOSE) run --rm -e RESET_DB_ASSUME_YES flyway bash scripts/reset-db.sh

reproduce-occ: ## Race two concurrent migrate runs (drops $DSQL_SCHEMA first, no prompt)
	bash scripts/reproduce-occ-conflict.sh

# test-occ is deliberately NOT part of `make test`. It races two migrate runs,
# and the outcome is non-deterministic by design: sometimes one run recovers,
# sometimes both fail and the schema needs repair. A suite that is expected to
# pass cannot include a target whose whole point is an unpredictable failure.
# Run it on its own when you want to see the race.
test: test-happy ## Run the deterministic test suite (drops $DSQL_SCHEMA, no prompt)

test-happy: ## End-to-end apply + verify (drops $DSQL_SCHEMA, no prompt)
	$(RUN) bash tests/test-happy-path.sh

test-occ: ## Concurrent-migrate race; non-deterministic, not part of `make test` (drops $DSQL_SCHEMA, no prompt)
	bash tests/test-occ-handling.sh

clean: ## Remove local Docker image and tmp files
	-$(COMPOSE) down --rmi all --volumes
	rm -rf tmp/
