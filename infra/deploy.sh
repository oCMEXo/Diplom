#!/usr/bin/env bash
# Run on the EC2 host from the repository root: ./infra/deploy.sh
set -euo pipefail

COMPOSE="docker compose -f infra/docker-compose.yml --env-file infra/.env"

git pull --ff-only
docker pull node:22-alpine
docker pull python:3.12-alpine
$COMPOSE build
$COMPOSE run --rm migrate
$COMPOSE up -d --remove-orphans
$COMPOSE ps
