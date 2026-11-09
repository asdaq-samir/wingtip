# 0003. All new work follows the modular architecture

- **Date:** 2026-11-09
- **Status:** Accepted

## Context

The simplicity audit scored 1.75 of 3; single responsibility and single knowledge owner scored lowest, and god files (a 2,250-line planning hook, a 3,100-line schemas module) made every change touch many files.

## Decision

"Make sure to follow modular architecture." Engine: each rule in the lowest crate, in its own module, composed from existing rules with no copied thresholds, registered in `call.rs` as that crate's own block. Planner: its own router module and schemas module, and a `wingtip` module for the data work; the router only parses, calls and returns. Web: a feature folder with view components and one hook per screen; shared code only in `lib/`; no feature imports another feature's internals. Phones: a view plus one observable model per screen. Everywhere: small files (under about 300 lines), and nothing added to the god files.

## Consequences

Every agent brief carries these rules. New code that grows a god file instead of adding a module is sent back.

## Source

The owner, 2026-11-09, while many feature agents were running; the simplicity audit (measure-software-simplicity skill).
