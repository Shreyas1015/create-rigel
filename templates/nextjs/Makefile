# Daily-driver targets — thin wrappers over the npm scripts so muscle memory works.
# Committed in the template (parked/restored by /infra-setup). Run `make help`.
# NOTE: recipes are TAB-indented (Make requirement).
.DEFAULT_GOAL := help
.PHONY: help setup dev build start lint format typecheck test coverage e2e gate api-sync analyze docker-build

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup: ## Phase 0 infra setup (run after the create-next-app scaffold step)
	bash .claude/scripts/infra-setup.sh

dev: ## Run the dev server
	npm run dev

build: ## Production build
	npm run build

start: ## Start the production server
	npm run start

lint: ## ESLint (flat config)
	npm run lint

format: ## Prettier (write)
	npm run format

typecheck: ## tsc --noEmit
	npm run typecheck

test: ## Unit tests (watch)
	npm run test

coverage: ## Unit tests + per-layer coverage gate
	npm run test:coverage

e2e: ## Playwright end-to-end tests
	npm run test:e2e

gate: ## Full layer gate (typecheck + lint + format:check + coverage)
	npm run gate

api-sync: ## Regenerate API types from openapi.json
	npm run api:sync

analyze: ## Bundle analysis
	npm run analyze

docker-build: ## Build the production container image
	docker build -t app:local .
