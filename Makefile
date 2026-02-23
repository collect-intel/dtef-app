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

.PHONY: help rerun-evals rerun-evals-force rerun-evals-batch queue-status queue-watch backfill-summary lightweight-backfill streaming-summaries dev build test test-infra \
	s3-status s3-runs s3-watch s3-size s3-latest \
	dtef-import dtef-import-all dtef-generate dtef-baselines dtef-baselines-all dtef-publish dtef-upload-baselines dtef-upload-baselines-all dtef-stats dtef-rebuild dtef-pipeline dtef-status

help: ## Show available commands
	@echo "\033[1mEvaluations:\033[0m"
	@grep -E '^(rerun|queue|backfill|lightweight|streaming)[a-zA-Z0-9_-]*:.*?## .*$$' Makefile | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'
	@echo "\033[1mDTEF Workflow:\033[0m"
	@grep -E '^dtef-[a-zA-Z0-9_-]*:.*?## .*$$' Makefile | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'
	@echo "\033[1mS3:\033[0m"
	@grep -E '^s3-[a-zA-Z0-9_-]*:.*?## .*$$' Makefile | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'
	@echo "\033[1mDev:\033[0m"
	@grep -E '^(dev|build|test|test-infra):.*?## .*$$' Makefile | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'

# --- Evaluations ---

rerun-evals: ## Trigger evaluation scheduler (respects 1-week freshness check)
	@echo "Triggering evaluation scheduler at $(APP_URL)..."
	@curl -s -X POST "$(APP_URL)/api/internal/fetch-and-schedule-evals" \
		-H "Content-Type: application/json" \
		-H "X-Background-Function-Auth-Token: $(BACKGROUND_FUNCTION_AUTH_TOKEN)" \
		| python3 -m json.tool 2>/dev/null || echo "(no JSON response)"

backfill-summary: ## Rebuild all summary/aggregate files in S3 from existing results (heavy, may OOM)
	pnpm cli backfill-summary

lightweight-backfill: ## Rebuild aggregate files from per-config summaries (memory-efficient)
	pnpm cli lightweight-backfill

streaming-summaries: ## Save missing per-config summaries then rebuild aggregates
	pnpm cli streaming-summaries && pnpm cli lightweight-backfill

rerun-evals-batch: ## Schedule a batch of evals (default 50, override with BATCH=N)
	$(eval BATCH ?= 50)
	@echo "Scheduling batch of $(BATCH) evaluations at $(APP_URL)..."
	@curl -s -X POST "$(APP_URL)/api/internal/fetch-and-schedule-evals" \
		-H "Content-Type: application/json" \
		-H "X-Background-Function-Auth-Token: $(BACKGROUND_FUNCTION_AUTH_TOKEN)" \
		-d '{"limit": $(BATCH)}' \
		| python3 -m json.tool 2>/dev/null || echo "(no JSON response)"

rerun-evals-force: ## Force rerun ALL periodic evaluations (ignores freshness check)
	@echo "Force-triggering ALL evaluations at $(APP_URL)..."
	@curl -s -X POST "$(APP_URL)/api/internal/fetch-and-schedule-evals" \
		-H "Content-Type: application/json" \
		-H "X-Background-Function-Auth-Token: $(BACKGROUND_FUNCTION_AUTH_TOKEN)" \
		-d '{"force": true}' \
		| python3 -m json.tool 2>/dev/null || echo "(no JSON response)"

queue-status: ## Check evaluation queue status (active, queued, completed, failures)
	@curl -s "$(APP_URL)/api/internal/queue-status" \
		-H "X-Background-Function-Auth-Token: $(BACKGROUND_FUNCTION_AUTH_TOKEN)" \
		| python3 -m json.tool 2>/dev/null || echo "(no JSON response)"

queue-watch: ## Watch queue status (refreshes every 15s, ctrl-c to stop)
	@echo "Watching evaluation queue (every 15s)..."
	@while true; do \
		echo "------- $$(date) -------"; \
		curl -s "$(APP_URL)/api/internal/queue-status" \
			-H "X-Background-Function-Auth-Token: $(BACKGROUND_FUNCTION_AUTH_TOKEN)" \
			| python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Active: {d[\"active\"]}  Queued: {d[\"queued\"]}  Completed: {d[\"totalCompleted\"]}  Failed: {d[\"totalFailed\"]}  Enqueued: {d[\"totalEnqueued\"]}  Uptime: {d[\"uptimeSeconds\"]}s'); print(f'Last completed: {d[\"lastCompletedId\"] or \"(none)\"} at {d[\"lastCompletedAt\"] or \"(never)\"}'); print(f'Last failed: {d[\"lastFailedId\"] or \"(none)\"} at {d[\"lastFailedAt\"] or \"(never)\"}')" 2>/dev/null || echo "(no response)"; \
		sleep 15; \
	done

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

# --- DTEF Workflow ---
# Typical workflow for new survey data:
#   1. make dtef-import ROUND=GD8        (import new GD round)
#   2. make dtef-generate ROUND=GD8      (generate blueprints)
#   3. make dtef-baselines ROUND=GD8     (generate baseline predictors)
#   4. make dtef-publish ROUND=GD8       (publish blueprints to dtef-configs repo)
#   5. make dtef-upload-baselines ROUND=GD8  (upload baselines to S3)
#   6. make rerun-evals                  (trigger model evaluations)
#   7. make streaming-summaries          (rebuild summaries after evals complete)
#   8. make dtef-stats                   (run statistical analysis)
# Or run steps 1-5 at once: make dtef-pipeline ROUND=GD8

DTEF_CONFIGS_DIR ?= ../dtef-configs
ROUND ?=

dtef-import: ## Import a GD round (ROUND=GD4)
	@test -n "$(ROUND)" || (echo "Usage: make dtef-import ROUND=GD4" && exit 1)
	pnpm cli dtef import-gd --round $(ROUND)

dtef-import-all: ## Import all available GD rounds
	pnpm cli dtef import-gd --all

dtef-generate: ## Generate blueprints for a round (ROUND=GD4, CTX=5 for context questions)
	@test -n "$(ROUND)" || (echo "Usage: make dtef-generate ROUND=GD4 [CTX=5]" && exit 1)
	$(eval ROUND_LC := $(shell echo $(ROUND) | tr A-Z a-z))
	$(eval INPUT := output/$(ROUND_LC).json)
	@test -f $(INPUT) || (echo "Survey data not found: $(INPUT) — run 'make dtef-import ROUND=$(ROUND)' first" && exit 1)
	@echo "Generating blueprints from $(INPUT)..."
	pnpm cli dtef generate -i $(INPUT) -o output/blueprints/$(ROUND_LC)
	@if [ -n "$(CTX)" ]; then \
		echo "Generating context blueprints ($(CTX) context questions)..."; \
		pnpm cli dtef generate -i $(INPUT) -o output/dtef-blueprints-ctx/$(ROUND_LC) --context-questions $(CTX); \
	fi

dtef-baselines: ## Generate baseline predictor results for a round (ROUND=GD4)
	@test -n "$(ROUND)" || (echo "Usage: make dtef-baselines ROUND=GD4" && exit 1)
	$(eval ROUND_LC := $(shell echo $(ROUND) | tr A-Z a-z))
	$(eval INPUT := output/$(ROUND_LC).json)
	@test -f $(INPUT) || (echo "Survey data not found: $(INPUT) — run 'make dtef-import ROUND=$(ROUND)' first" && exit 1)
	pnpm cli dtef generate-baseline -i $(INPUT) -o output/baselines/$(ROUND_LC) --type population-marginal --force
	pnpm cli dtef generate-baseline -i $(INPUT) -o output/baselines/$(ROUND_LC) --type uniform --force

dtef-baselines-all: ## Generate baselines for all imported survey rounds
	@for f in output/gd*.json; do \
		round=$$(basename $$f .json); \
		echo "=== Generating baselines for $$round ==="; \
		pnpm cli dtef generate-baseline -i $$f -o output/baselines/$$round --type population-marginal --force; \
		pnpm cli dtef generate-baseline -i $$f -o output/baselines/$$round --type uniform --force; \
		echo ""; \
	done

dtef-upload-baselines-all: ## Upload all baseline results to S3
	@for dir in output/baselines/*/; do \
		test -d "$$dir" || continue; \
		round=$$(basename $$dir); \
		echo "=== Uploading baselines for $$round ==="; \
		aws s3 sync $$dir s3://$(S3_BUCKET)/live/blueprints/ --region $(S3_REGION); \
		echo ""; \
	done

dtef-publish: ## Publish blueprints to dtef-configs repo (ROUND=GD4)
	@test -n "$(ROUND)" || (echo "Usage: make dtef-publish ROUND=GD4" && exit 1)
	$(eval ROUND_LC := $(shell echo $(ROUND) | tr A-Z a-z))
	@test -d $(DTEF_CONFIGS_DIR) || (echo "dtef-configs repo not found at $(DTEF_CONFIGS_DIR)" && exit 1)
	pnpm cli dtef publish -s output/blueprints/$(ROUND_LC) -t $(DTEF_CONFIGS_DIR)/configs --tag $(ROUND_LC) --dry-run
	@echo ""
	@echo "Above is a dry run. To actually publish, run:"
	@echo "  pnpm cli dtef publish -s output/blueprints/$(ROUND_LC) -t $(DTEF_CONFIGS_DIR)/configs --tag $(ROUND_LC)"

dtef-upload-baselines: ## Upload baseline results to S3 (ROUND=GD4)
	@test -n "$(ROUND)" || (echo "Usage: make dtef-upload-baselines ROUND=GD4" && exit 1)
	$(eval ROUND_LC := $(shell echo $(ROUND) | tr A-Z a-z))
	@test -d output/baselines/$(ROUND_LC) || (echo "Baselines not found — run 'make dtef-baselines ROUND=$(ROUND)' first" && exit 1)
	@echo "Uploading baselines to S3..."
	aws s3 sync output/baselines/$(ROUND_LC)/ s3://$(S3_BUCKET)/live/blueprints/ --region $(S3_REGION) --dryrun
	@echo ""
	@echo "Above is a dry run. To actually upload, run:"
	@echo "  aws s3 sync output/baselines/$(ROUND_LC)/ s3://$(S3_BUCKET)/live/blueprints/ --region $(S3_REGION)"

dtef-stats: ## Run statistical analysis report
	pnpm analyze:stats

dtef-rebuild: ## Rebuild DTEF summary in S3 (includes baselines on demographics page)
	NODE_OPTIONS=--max-old-space-size=6144 pnpm cli dtef-rebuild

dtef-pipeline: ## Run full pipeline for a round: import → generate → baselines (ROUND=GD4)
	@test -n "$(ROUND)" || (echo "Usage: make dtef-pipeline ROUND=GD4 [CTX=5]" && exit 1)
	$(eval ROUND_LC := $(shell echo $(ROUND) | tr A-Z a-z))
	@echo "=== Step 1/3: Import $(ROUND) ==="
	$(MAKE) dtef-import ROUND=$(ROUND)
	@echo ""
	@echo "=== Step 2/3: Generate blueprints ==="
	$(MAKE) dtef-generate ROUND=$(ROUND) CTX=$(CTX)
	@echo ""
	@echo "=== Step 3/3: Generate baselines ==="
	$(MAKE) dtef-baselines ROUND=$(ROUND)
	@echo ""
	@echo "=== Pipeline complete ==="
	@echo "Next steps:"
	@echo "  make dtef-publish ROUND=$(ROUND)           # publish blueprints to dtef-configs"
	@echo "  make dtef-upload-baselines ROUND=$(ROUND)  # upload baselines to S3"
	@echo "  make rerun-evals                           # trigger model evaluations"

dtef-status: ## Show local DTEF data: imported rounds, blueprints, baselines
	@echo "=== Imported Survey Data ==="
	@ls -1 output/gd*.json 2>/dev/null | sed 's|output/||' || echo "  (none)"
	@echo ""
	@echo "=== Generated Blueprints ==="
	@for dir in output/blueprints/*/; do \
		test -d "$$dir" && echo "  $$(basename $$dir): $$(ls $$dir | wc -l | xargs) configs"; \
	done 2>/dev/null || echo "  (none)"
	@echo ""
	@echo "=== Context Blueprints ==="
	@for dir in output/dtef-blueprints-ctx/*/; do \
		test -d "$$dir" && echo "  $$(basename $$dir): $$(ls $$dir | wc -l | xargs) configs"; \
	done 2>/dev/null || echo "  (none)"
	@echo ""
	@echo "=== Baseline Results ==="
	@for dir in output/baselines/*/; do \
		test -d "$$dir" && echo "  $$(basename $$dir): $$(ls $$dir | wc -l | xargs) files"; \
	done 2>/dev/null || echo "  (none)"

# --- Dev ---

dev: ## Start local dev server
	pnpm dev

build: ## Build for production
	pnpm build

test: ## Run all tests
	pnpm test

test-infra: ## Run infrastructure validation tests
	pnpm test:infra
