# 0010. No EMER button on the map

- **Date:** 2026-11-08
- **Status:** Accepted

## Context

The map had an EMER button opening the airplane's emergency checklist. It was on the ground as well as in the air for a day.

## Decision

"No need for it." The button is gone on the web, the iPhone and Android. Each airplane's emergency checklists stay, with their entry on the airplane's screen (Emergency row, Setup's Airplanes, the briefing's checklists).

## Consequences

Do not add an emergency control to the map. The checklists themselves are the pilot's own and are kept on the device (the gateway no longer stores them).

## Source

The owner, 2026-11-08 (commits ebd8f03b, 4c36c80c). Supersedes the same day's earlier choice to show EMER on the ground (53ec7627).
