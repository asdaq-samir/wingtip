#!/usr/bin/env bash
# pr-caches.yml: a closed pull request's Actions caches deleted. Its runs
# could only ever read them again themselves (a cache is scoped to the ref
# that wrote it), so once it is closed they only crowd the repository's
# 10 GB store, and GitHub then evicts main's -- the iPhone's DerivedData
# went within an hour on 2026-11-14, and PR #577's tier 1 took 9-22 min
# (docs/CI.md, "The tiers"). Both of its refs: refs/pull/N/merge, which its
# CI runs on, and refs/pull/N/head, which code scanning ran on. One delete
# at a time, ten seconds apart (CLAUDE.md, "write to GitHub gently").
# Needs GH_TOKEN (actions: write), GH_REPO and PR.
set -euo pipefail
for ref in "refs/pull/$PR/merge" "refs/pull/$PR/head"; do
  for id in $(gh cache list --ref "$ref" --limit 100 --json id --jq '.[].id'); do
    gh cache delete "$id"
    echo "deleted cache $id of $ref"
    sleep 10
  done
done
