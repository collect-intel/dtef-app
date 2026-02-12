# DTEF App Makefile
# Convenience commands for common operations

# Load .env file for auth tokens
ifneq (,$(wildcard .env))
  include .env
  export
endif

# Default target for production
APP_URL ?= $(NEXT_PUBLIC_APP_URL)
# Fallback to local dev server
APP_URL := $(or $(APP_URL),http://localhost:3172)

S3_BUCKET := collect-intel-dtef
S3_REGION := us-east-1

.PHONY: help rerun-evals rerun-evals-force backfill-summary dev build test test-infra \
	s3-status s3-runs s3-watch s3-size s3-latest

help: ## Show available commands
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' Makefile | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# --- Evaluations ---

rerun-evals: ## Trigger evaluation scheduler (respects 1-week freshness check)
	@echo "Triggering evaluation scheduler at $(APP_URL)..."
	@curl -s -X POST "$(APP_URL)/api/internal/fetch-and-schedule-evals" \
		-H "Content-Type: application/json" \
		-H "X-Background-Function-Auth-Token: $(BACKGROUND_FUNCTION_AUTH_TOKEN)" \
		| python3 -m json.tool 2>/dev/null || echo "(no JSON response)"

backfill-summary: ## Rebuild all summary/aggregate files in S3 from existing results
	pnpm cli backfill-summary

rerun-evals-force: ## Force rerun ALL periodic evaluations (ignores freshness check)
	@echo "Force-triggering ALL evaluations at $(APP_URL)..."
	@curl -s -X POST "$(APP_URL)/api/internal/fetch-and-schedule-evals" \
		-H "Content-Type: application/json" \
		-H "X-Background-Function-Auth-Token: $(BACKGROUND_FUNCTION_AUTH_TOKEN)" \
		-d '{"force": true}' \
		| python3 -m json.tool 2>/dev/null || echo "(no JSON response)"

# --- S3 ---

s3-status: ## Show S3 overview: run count, total objects, aggregates
	@echo "=== Runs ==="
	@aws s3 ls s3://$(S3_BUCKET)/live/blueprints/ --region $(S3_REGION) --recursive \
		| grep "_comparison.json" | wc -l | xargs printf "  Run files: %s\n"
	@aws s3 ls s3://$(S3_BUCKET)/live/blueprints/ --region $(S3_REGION) \
		| wc -l | xargs printf "  Blueprint dirs: %s\n"
	@aws s3 ls s3://$(S3_BUCKET)/live/blueprints/ --region $(S3_REGION) --recursive \
		| wc -l | xargs printf "  Total objects: %s\n"
	@echo "=== Aggregates ==="
	@aws s3 ls s3://$(S3_BUCKET)/live/aggregates/ --region $(S3_REGION) 2>/dev/null \
		|| echo "  (none)"
	@echo "=== Models ==="
	@aws s3 ls s3://$(S3_BUCKET)/live/models/ --region $(S3_REGION) --recursive 2>/dev/null \
		| wc -l | xargs printf "  Model summaries: %s\n"

s3-runs: ## List all run files with timestamps
	@aws s3 ls s3://$(S3_BUCKET)/live/blueprints/ --region $(S3_REGION) --recursive \
		| grep "_comparison.json"

s3-latest: ## Show the 10 most recent run files
	@aws s3 ls s3://$(S3_BUCKET)/live/blueprints/ --region $(S3_REGION) --recursive \
		| grep "_comparison.json" | sort -k1,2 | tail -10

s3-watch: ## Watch eval progress (refreshes every 30s, ctrl-c to stop)
	@echo "Watching S3 for new runs (every 30s)..."
	@while true; do \
		echo "------- $$(date) -------"; \
		aws s3 ls s3://$(S3_BUCKET)/live/blueprints/ --region $(S3_REGION) --recursive \
			| grep "_comparison.json" | wc -l | xargs printf "Run files: %s\n"; \
		aws s3 ls s3://$(S3_BUCKET)/live/blueprints/ --region $(S3_REGION) --recursive \
			| grep "_comparison.json" | sort -k1,2 | tail -3; \
		sleep 30; \
	done

s3-size: ## Show total S3 bucket size
	@aws s3 ls s3://$(S3_BUCKET)/live/ --region $(S3_REGION) --recursive --summarize \
		| tail -2

# --- Dev ---

dev: ## Start local dev server
	pnpm dev

build: ## Build for production
	pnpm build

test: ## Run all tests
	pnpm test

test-infra: ## Run infrastructure validation tests
	pnpm test:infra
