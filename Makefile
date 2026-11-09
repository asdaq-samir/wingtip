# One command for each thing a developer does most. `make` alone lists them.
# The steps are in scripts/dev/dev.sh and the scripts named below; this file
# only names them, so each also runs on its own. make ships with macOS and
# every Linux; Docker is the one thing to install (docs/LOCAL-DEV.md).

.DEFAULT_GOAL := help
.PHONY: help dev doctor stop down logs ps check live

help: ## List the commands
	@echo "Wingtip Maps: make <command>"
	@echo
	@awk 'BEGIN {FS = ":.*## "} /^[a-z-]+:.*## / {printf "  make %-10s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo
	@echo "  make logs s=planner   follow one service (planner, gateway, ingest, weather, assistant, db, mailpit)"

dev: ## Check Docker, build the images, start the stack, wait for health, print the URLs
	@scripts/dev/dev.sh up

doctor: ## Check what `make dev` needs (Docker, its memory, the ports, .env) and change nothing but a missing .env
	@scripts/dev/dev.sh doctor

stop: ## Stop the stack; its data and images are kept
	docker compose stop

down: ## Stop the stack and remove its containers; the database volume is kept
	docker compose down

ps: ## Show each service and its health
	docker compose ps

logs: ## Follow a service's log: make logs s=<service> (every service when s is left out)
	docker compose logs -f --tail=100 $(s)

check: ## The quick checks for what this branch changed (scripts/dev/check.sh all-changed)
	scripts/dev/check.sh all-changed

live: ## Put a branch on the owner's phone stack (scripts/dev/go-live.sh; b=<branch>, default claude/integration)
	scripts/dev/go-live.sh $(b)
