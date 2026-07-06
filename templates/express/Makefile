# Makefile — thin wrapper over the npm scripts so the same verbs (make gate, make
# dev, make test, make setup) work identically across the harness family (FastAPI,
# Express, NestJS). The npm scripts in package.json remain the source of truth;
# this just gives cross-stack muscle memory. Run `make` or `make help` for the list.

.DEFAULT_GOAL := help
.PHONY: help setup dev build start test test-coverage gate lint format typecheck \
        check-circular audit openapi migrate migrate-undo seed load-smoke load-stress \
        load-soak up down logs

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

setup: ## First-run: install deps (the agent flow uses /infra-setup; this is the manual path)
	npm install

dev: ## Run the dev server (tsx watch)
	npm run dev

build: ## Compile TypeScript to dist/
	npm run build

start: ## Run the compiled server
	npm run start

test: ## Run the test suite
	npm test

test-coverage: ## Run tests with coverage (per-layer thresholds enforced)
	npm run test:coverage

gate: ## The deterministic gate: typecheck + lint + circular-check + arch tests
	npm run gate

lint: ## ESLint (0 warnings; includes layer-boundary enforcement)
	npm run lint

format: ## Prettier write
	npm run format

typecheck: ## tsc --noEmit
	npm run typecheck

check-circular: ## madge circular-import check
	npm run check:circular

audit: ## npm audit (fail on high+)
	npm run audit

openapi: ## Regenerate docs/generated/openapi.{json,yaml}
	npm run openapi:export

migrate: ## Run DB migrations
	npm run db:migrate

migrate-undo: ## Revert the last migration
	npm run db:migrate:undo

seed: ## Seed the database
	npm run db:seed

load-smoke: ## k6 smoke test
	npm run load:smoke

load-stress: ## k6 stress test
	npm run load:stress

load-soak: ## k6 soak test
	npm run load:soak

up: ## Start the local stack (postgres, redis, app, lgtm, alloy)
	docker compose up -d

down: ## Stop the local stack and remove volumes
	docker compose down -v

logs: ## Tail the app container logs
	docker compose logs -f app
