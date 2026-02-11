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

.PHONY: help rerun-evals rerun-evals-force dev build test

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' Makefile | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

rerun-evals: ## Trigger evaluation scheduler (respects 1-week freshness check)
	@echo "Triggering evaluation scheduler at $(APP_URL)..."
	@curl -s -X POST "$(APP_URL)/api/internal/fetch-and-schedule-evals" \
		-H "Content-Type: application/json" \
		-H "X-Background-Function-Auth-Token: $(BACKGROUND_FUNCTION_AUTH_TOKEN)" \
		| python3 -m json.tool 2>/dev/null || echo "(no JSON response)"

rerun-evals-force: ## Force rerun ALL periodic evaluations (ignores freshness check)
	@echo "Force-triggering ALL evaluations at $(APP_URL)..."
	@curl -s -X POST "$(APP_URL)/api/internal/fetch-and-schedule-evals" \
		-H "Content-Type: application/json" \
		-H "X-Background-Function-Auth-Token: $(BACKGROUND_FUNCTION_AUTH_TOKEN)" \
		-d '{"force": true}' \
		| python3 -m json.tool 2>/dev/null || echo "(no JSON response)"

dev: ## Start local dev server
	pnpm dev

build: ## Build for production
	pnpm build

test: ## Run all tests
	pnpm test

test-infra: ## Run infrastructure validation tests
	pnpm test:infra
