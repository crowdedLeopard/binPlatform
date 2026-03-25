.PHONY: help dev dev-worker build test test-unit test-integration test-security test-cov lint lint-fix typecheck format docker-up docker-down db-migrate db-generate db-studio clean install audit openapi-lint ci

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	npm install

dev: ## Run API development server
	npm run dev

dev-worker: ## Run worker development server
	npm run dev:worker

build: ## Build TypeScript to JavaScript
	npm run build

test: ## Run all tests
	npm test

test-unit: ## Run unit tests only
	npm run test:unit

test-integration: ## Run integration tests only
	npm run test:integration

test-security: ## Run security tests only
	npm run test:security

test-cov: ## Run tests with coverage
	npm run test:coverage

lint: ## Lint code
	npm run lint

lint-fix: ## Fix linting issues
	npm run lint:fix

typecheck: ## Type check without emitting
	npm run typecheck

format: ## Format code
	npm run format

docker-up: ## Start all services with docker-compose
	docker-compose -f deploy/compose/docker-compose.yml up -d

docker-down: ## Stop all services
	docker-compose -f deploy/compose/docker-compose.yml down

docker-logs: ## Tail docker logs
	docker-compose -f deploy/compose/docker-compose.yml logs -f

db-migrate: ## Run database migrations
	npm run db:migrate

db-generate: ## Generate migration from schema
	npm run db:generate

db-studio: ## Open Drizzle Studio
	npm run db:studio

audit: ## Run security audit
	npm run security:audit

openapi-lint: ## Validate OpenAPI specification
	npm run openapi:validate

clean: ## Clean build artifacts
	rm -rf dist coverage .playwright

ci: lint typecheck test build ## Run CI pipeline locally
