# Makefile for the Flyway + Aurora DSQL POC.
#
# All targets expect AWS_REGION and DSQL_ENDPOINT to be set in the shell
# or in a local .env file (not committed).
#
# Prefer `make help` to discover targets.

SHELL := /bin/bash
.DEFAULT_GOAL := help

ifneq (,$(wildcard .env))
include .env
export
endif

IMAGE   := flyway-dsql-poc:latest
COMPOSE := docker compose
RUN     := $(COMPOSE) run --rm flyway

.PHONY: help build info migrate repair validate reset verify-schema \
        reproduce-occ test test-happy test-occ clean

help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z0-9_-]+:.*?## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build the flyway-dsql-poc Docker image (compiles the Flyway extension too)
	$(COMPOSE) build

info: ## Show Flyway migration status against the configured cluster
	$(RUN) bash scripts/run-flyway.sh info

migrate: ## Apply pending migrations (Flyway + Aurora DSQL extension)
	$(RUN) bash scripts/run-flyway.sh migrate

repair: ## Clear failed migrations from flyway_schema_history so retry can proceed
	$(RUN) bash scripts/run-flyway.sh repair

validate: ## Validate applied migrations against the migration files
	$(RUN) bash scripts/run-flyway.sh validate

verify-schema: ## Inspect the cluster: tables, flyway_schema_history, indexes
	$(RUN) bash scripts/verify-schema.sh

reset: ## Drop every object the migrations created (DANGEROUS; dev only)
	$(RUN) bash scripts/reset-db.sh

reproduce-occ: ## Run two concurrent migrate to force an OCC conflict
	bash scripts/reproduce-occ-conflict.sh

test: test-happy test-occ ## Run every POC test in order

test-happy: ## End-to-end apply + verify
	$(RUN) bash tests/test-happy-path.sh

test-occ: ## Prove the OCC retry loop recovers from a concurrent migrate race
	bash tests/test-occ-handling.sh

clean: ## Remove local Docker image and tmp files
	-$(COMPOSE) down --rmi local --volumes
	rm -rf tmp/
