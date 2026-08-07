# Makefile — single-command developer experience for the FastAPI harness.
# Every command in the docs goes through a target here so humans and agents
# run the exact same thing. Generated/maintained alongside /infra-setup.

.PHONY: bootstrap dev lint format typecheck test gate contract knowledge migrate openapi up down lgtm

bootstrap:        ## one-command setup: sync deps + install git hooks
	uv sync && uv run pre-commit install

dev:              ## run the API with autoreload
	uv run uvicorn src.runtime.main:app --reload

lint:             ## ruff lint
	uv run ruff check src/ tests/

format:           ## ruff format (writes)
	uv run ruff format src/ tests/

typecheck:        ## mypy strict
	uv run mypy src/

test:             ## full test suite + coverage
	uv run pytest

gate:             ## deterministic gate — same checks the gate-checker agent runs
	bash scripts/gate.sh

contract:         ## contract gate alone — spec freshness + breaking changes + exemption expiry
	python3 scripts/contract_gate.py

knowledge:        ## BLOCKING (PLAN-009/011): do knowledge/ anchors still resolve? also runs inside `make gate`
	python3 scripts/rigel_knowledge.py

migrate:          ## apply migrations
	uv run alembic upgrade head

# Written via a temp file then mv: a plain `> openapi.json` truncates BEFORE python runs, so a
# failed export would leave an EMPTY committed contract — the exact artifact the contract gate
# re-runs this target to verify. Atomic write, or no write at all.
openapi:          ## export OpenAPI spec to openapi.json (loads .env if present so settings validate)
	set -a; [ -f .env ] && . ./.env; set +a; \
	uv run python -c "import json,sys; from src.runtime.main import app; json.dump(app.openapi(), sys.stdout, indent=2); sys.stdout.write('\n')" > openapi.json.tmp \
	  && mv openapi.json.tmp openapi.json \
	  || { rm -f openapi.json.tmp; exit 1; }

up:               ## start local stack (app + postgres + redis)
	docker compose up -d

down:             ## stop local stack
	docker compose down

lgtm:             ## start local observability stack (Grafana/Loki/Tempo/Prometheus)
	docker compose -f infra/monitoring/docker-compose.lgtm.yml up -d
