#!/usr/bin/env bash
set -euo pipefail
PROJECT_ID='187c97be-a473-4d75-9d95-2ceb6efde05a'
ENVIRONMENT_ID='64d0c072-1383-4b85-a55e-115364b4b39b'
SERVICE_ID='2af7305d-111d-49ac-bb49-7e356b8c5433'
if ! command -v railway >/dev/null 2>&1; then
  if ! command -v npm >/dev/null 2>&1; then echo 'Install Node.js 20+ first: https://nodejs.org/' >&2; exit 1; fi
  npm install -g @railway/cli
fi
railway login
railway link --project "$PROJECT_ID" --environment "$ENVIRONMENT_ID" --service "$SERVICE_ID"
railway up --detach
echo 'Upload submitted. Verify build logs and /api/health in Railway before launch.'
