# 0039. The crash pipeline's schedule and the MCP tools' source, weighed against their alternatives

- **Date:** 2026-11-12
- **Status:** Accepted (owner, 2026-11-12: both recommendations: the crash
  loop stays in the jobs service until the host is chosen (#115); the MCP
  tools stay hand-written)

## Context

The simplicity re-audit of 2026-11-12 (principle "design boundaries
twice") found two boundaries built without a record that compared them
with another way. [0036](0036-mcp-connector.md) states the MCP choice (a
connector the pilot adds to their own Claude or ChatGPT) and says nothing
of how the connector's tools are made; [0004](0004-server-split.md) splits
the services by job and says nothing of who runs the crash pipeline. This
page compares the options for each so the choice is written down with its
price.

## Crash pipeline: who runs it, and when

Today `services/jobs/crash` reads the FAA's statements and notices into the
Studio's crash leads, makes the kits and fills them. Its `every` command
(`cli.py`) is a loop with its own sleep (`CRASH_LEADS_EVERY_MIN`, off when
`CRASH_LEADS_AUTO` is 0), run as the `crash-leads` compose service. Its
`poll` command is the same work once. The gateway mails the finished drafts
with a Spring `@Scheduled` look every five minutes (`CrashDraftMail`),
asking the planner which drafts are ready.

| Option | For | Against |
|---|---|---|
| **A. A loop in the jobs service** (today) | One image and one place for the interval (an environment variable). Works the same on the Mac, in compose and on a host. Nothing outside the repo to set up. | A container that sleeps between runs; its own restart policy; a run missed while it is down is not made up. The loop is a small scheduler written by hand. |
| **B. A one-shot `poll`, run by a scheduler** (a compose-scheduled job, a systemd timer, an EventBridge task or cron) | No idle process; the schedule and its retries are the platform's; a failed run is a failed task someone sees. `poll` already exists, so the unit of work is unchanged. | The interval lives outside the code (a second place to keep in step); the Mac's stack needs its own timer (launchd); and the launch host is not chosen yet (#115 is open). |
| **C. A Spring `@Scheduled` task that calls the planner to run it** | One scheduler for everything the gateway sends. | The gateway would trigger aviation-adjacent work it must not hold (0004: Spring holds no aviation logic); the planner would gain the pipeline again, which finding 8 took out. |

The mail look stays in the gateway under any option: mail is the gateway's
(0004), and the look asks the planner, which holds the answer.

**Recommendation:** keep A until the launch host is chosen (#115). Nothing
is in production, the loop is small and logged, and `poll` is the one-shot
unit B would call, so moving to a platform timer later is a change of how
the container starts, not of the pipeline. Pick B with the host.

## The MCP tools: written by hand, or generated

The planner's connector (`app/mcp`) has ten tools in about 970 lines. Each
asks the planner's own endpoint through `planner_calls.py`, which is
already generated from the planner's OpenAPI document, so no tool types an
HTTP path. What is hand-written is each tool's name, its description for a
model, its parameters and how it shapes the answer. The assistant's own
tools are different: `rule_tools` are generated from the engine contract's
`"x-tool"` tags, which cover rules, not the planner's endpoints.

| Option | For | Against |
|---|---|---|
| **A. Hand-written tools over the generated calls** (today) | Each description is written for a model, with the CFR or AIM reference where there is one. Each answer is trimmed to what a model needs, so a call costs a pilot's subscription few tokens. `save_flight`'s confirmation and the read-only flags are visible in the code. The tool list is a reviewed contract (0036's snapshot test). | Ten wrappers to keep in step with the endpoints they wrap; a new tool costs a file, not a tag. |
| **B. Generated from the OpenAPI document**, tools tagged like `"x-tool"` | A new tool is a tag on an endpoint; names, parameters and types cannot drift from the planner's. | API descriptions are written for developers, not a model; the answers are whole API bodies, which cost tokens and expose fields no one asked for; confirmation and read-only handling need hand-written exceptions anyway. |
| **C. Generated shells with small hand-written hooks** (a description and a shaping function per tool) | Parameters and types cannot drift; the hand-written part is only what a model needs. | A generator and a hook table to build and keep, for ten tools; the saving shows only with many more. |

**Recommendation:** keep A. The duplication a generator would remove is
already gone (the calls are generated); what is left is the part that
should be written for a model. Revisit with C when the tools pass about
twenty or the same shaping is repeated in three tools. A Semgrep rule
(`planner-http.yml`) already stops a tool from typing a path.

## Consequences

Neither choice changes code today. If the owner picks the other option for
either, the work is one branch: B for the crash schedule is a compose or
timer change plus `CRASH_LEADS_AUTO` set to 0; B or C for the tools is a
generator beside `scripts/build/planner_calls.py`, with the snapshot test
holding the tool list steady.

## Source

The simplicity re-audit of 2026-11-12 (the "Design boundaries twice" finding:
"the crash pipeline and the MCP tools still have no decision record that
compares options").
