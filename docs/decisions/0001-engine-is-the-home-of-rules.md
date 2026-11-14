# 0001. Every aviation rule lives once, in the Rust engine

- **Date:** 2026-11-03
- **Status:** Accepted

## Context

The web app, the iPhone, Android, the planner and the gateway each carried their own copy of rules such as altitudes, runway wording, fuel and currency, and the copies drifted. A wrong figure in a pilot's hands is a safety problem.

## Decision

Every aviation rule or figure is written once in the engine (`engine/`, ten domain crates behind `engine/facade`), as a named call in `engine/facade/src/call.rs`, JSON in and JSON out, typed in `engine/contract/engine.schema.json`. Apps and services ask the engine by name (`callEngine` on the web, `wt_call` on iOS, a JNI shim on Android, `wingtip_native.call` in the planner). A rule found in a component, a hook, a Swift view, a Java service or a route handler is a bug: move it into the engine and delete the copy. Issue #482 tracks what has not moved yet.

## Consequences

Adding or changing a rule means the Rust in the lowest crate that can hold it, its one contract file beside it (from which `call.rs`'s dispatch and the contract are generated), regenerated types, a test against the shared fixtures, the rebuilt committed `.wasm`, and the planner's image rebuilt (CLAUDE.md, Architecture). CI's "Rules boundary" job fails a change that writes a new rule outside the engine. Currency (14 CFR 61.56, 61.57) is still worked out in Java until #482 moves it; add no new rule there.

## Source

CLAUDE.md, Architecture; issue #482; commit e980530e (Rules boundary job).

Consequence, 2026-11-14 (the Android audit's AND-11): the Decision's
"`wt_call` on iOS, a JNI shim on Android" is no longer so. Both phones ask
the engine through the UniFFI bindings generated from engine/bindings/ffi
(`call(name, json)` and the typed EngineCalls); there is no JNI shim. The
web asks through `callEngine`, the planner through `wingtip_native.call`.
