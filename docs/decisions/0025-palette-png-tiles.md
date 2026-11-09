# 0025. Chart tiles, retina included, are palette PNGs

- **Date:** 2026-11-08
- **Status:** Accepted

## Context

Full-colour @2x tiles took about 115 GB a cycle against about 29 GB for 256-colour palette PNGs.

## Decision

Retina tiles are palette PNGs like the 1x ones. Measured on 150 sampled @2x tiles: 40.9 dB PSNR against the full-colour original, and no difference a pilot can see side by side at twice the size.

## Consequences

The format stays PNG, so no app needs anything new. Do not go back to full colour without a visible reason, because it costs about four times the disk.

## Source

The owner chose the palette, 2026-11-08 (commit 172b4b5f).
