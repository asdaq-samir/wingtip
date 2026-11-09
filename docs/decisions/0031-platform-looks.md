# 0031. Each platform may look its own best

- **Date:** 2026-11-04
- **Status:** Accepted

## Context

Web, iOS and Android have different conventions, and the native apps now exist.

## Decision

Web, iOS and Android may look different as long as each is the best for its platform; every function must stay reachable on each. The web-first hold was lifted on 2026-11-06, and native work goes ahead. Judge every screen at an iPhone's width against Apple's Human Interface Guidelines first.

## Consequences

A function in one app but not another needs a reason. How a figure is written stays with each app.

## Source

The owner, 2026-11-04 and 2026-11-06.
