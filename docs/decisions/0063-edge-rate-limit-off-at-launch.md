# 0063. The edge's rate limit is off at launch, turned on if abuse shows

- **Date:** 2026-11-27
- **Status:** Accepted (the owner, 2026-11-27: "Take out the waf rule",
  after "add it after abuse")
- **Amends:** the deep security review's N5 (2026-11-21) and round 4's
  M4, both closed by the `TileRateLimit` web ACL

## Context

The AWS WAF web ACL on the CloudFront distribution (`TileRateLimit`)
holds two rate rules: 3,000 requests to the chart and terrain tiles per
address in five minutes (N5: a tile address with a `?c=` or `?r=` of its
own misses the cache and is read on the server), and 3,000 to every
other `/api/planner/` path (M4: the anonymous planner routes had no
limit). It costs about $7.20 a month at launch traffic (a $5 web ACL,
$1 each rule, $0.60 a million requests it sees), growing to about $25
at 10,000 pilots, and took the stack from about $35 to about $42 a
month.

The owner asked why hosting had risen from $29 and, told what each rule
closes, chose to save the WAF's cost until there is abuse to stop.

## Decision

- The web ACL is made only with the template's `EdgeRateLimit=on`
  (default `off`); with it off, the distribution has no web ACL.
- N5 and M4 are open at launch, said so in docs/SECURITY.md.
- docs/RUNBOOKS.md, "The server under load", gives the signs and the one
  deploy that turns it on; nothing else changes.

## Consequences

- The stack costs about $35 a month on Spot (README-AWS.md).
- Until it is on, one address can keep the one server busy with
  cache-missing tiles or planner requests; the server's alarms
  (`HealthAlarm`, `ServicesAlarm`) and the budget mail are how it would
  show.
- Turning it on is a parameter on a deploy, a few minutes for CloudFront.
