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
# here: `reset` and the test targets drop tables, so pointing your shell at
# one cluster while .env names another must not silently resolve to .env.
ENV_DSQL_ENDPOINT := $(DSQL_ENDPOINT)
ENV_AWS_REGION    := $(AWS_REGION)

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
export DSQL_ENDPOINT AWS_REGION

COMPOSE := docker compose
RUN     := $(COMPOSE) run --rm flyway

.PHONY: help build info migrate repair validate reset verify-schema \
        reproduce-occ test test-happy test-occ clean

help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z0-9_-]+:.*?## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build the Docker image (Flyway CLI + Aurora DSQL module)
	$(COMPOSE) build

info: ## Show Flyway migration status against the configured cluster
	$(RUN) bash scripts/run-flyway.sh info

migrate: ## Apply pending migrations
	$(RUN) bash scripts/run-flyway.sh migrate

repair: ## Clear failed migrations from flyway_schema_history so retry can proceed
	$(RUN) bash scripts/run-flyway.sh repair

validate: ## Validate applied migrations against the migration files
	$(RUN) bash scripts/run-flyway.sh validate

verify-schema: ## Inspect the cluster: tables, flyway_schema_history, indexes
	$(RUN) bash scripts/verify-schema.sh

reset: ## Drop every object the migrations created (DANGEROUS; dev only)
	$(COMPOSE) run --rm -e RESET_DB_ASSUME_YES flyway bash scripts/reset-db.sh

reproduce-occ: ## Run two concurrent migrate against one cluster
	bash scripts/reproduce-occ-conflict.sh

test: test-happy test-occ ## Run every test in order

test-happy: ## End-to-end apply + verify
	$(RUN) bash tests/test-happy-path.sh

test-occ: ## Demonstrate a concurrent-migrate race (see KNOWN_LIMITATIONS.md #2)
	bash tests/test-occ-handling.sh

clean: ## Remove local Docker image and tmp files
	-$(COMPOSE) down --rmi local --volumes
	rm -rf tmp/
