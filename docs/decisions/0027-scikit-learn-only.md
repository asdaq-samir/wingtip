# 0027. Machine learning is scikit-learn only

- **Date:** 2026-11-06
- **Status:** Accepted

## Context

PyTorch, TensorFlow, Spark MLlib and sentence-transformers comparisons never reached a pilot; the project is a product and not a framework showcase.

## Decision

The chart scorer's training run grid-searches Ridge, RandomForest and GradientBoosting with scikit-learn only, and the planner scores in its own process.

## Consequences

No new ML framework dependency. The comparison notebooks are gone.

## Source

The owner, 2026-11-06 (commits 0a4677c3, 029cc95b).
