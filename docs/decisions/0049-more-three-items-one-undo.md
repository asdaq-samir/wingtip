# 0049. FPL's More holds three items, every edit offers its own Undo, and File is a button of its own

- **Date:** 2026-11-21
- **Status:** Accepted
- **Amends:** 0045 (item 6, "One Undo" in the ••• menu), 0029 (the nav log
  behind the ••• button) and 0047 (item 7: the Checkpoints switch is More's)

## Context

FPL's ••• ("More") had grown to the route's whole toolbox: Undo and Redo,
Clear route, the map's choices, Show Fuel Stops, Refresh, Save, the
checkpoints, the kneeboard, File flight plan, Type the Route, Route
Options, Share link and Open in ForeFlight. A pilot looking for one thing
read a dozen rows, and most of them had a better home where the pilot was
already looking.

## Decision

1. **More keeps its name and holds three items:** Route Options, Share link
   and Open in ForeFlight (the owner, 2026-11-21; e401f646d).
2. **Every edit offers its own Undo where it was made**, a toast ("KMSN
   Removed", "Route Cleared", "Altitude Changed", "Procedures Changed"),
   with Cmd-Z and Shift-Cmd-Z on a keyboard; the menu's Undo and Redo are
   gone (`hooks/planHistory`, `lib/planUndo`). A change that only picks
   runways into the wind is folded into the step it follows, as the page's
   own settling is (0668d6ea5).
3. **Each other item went to where it is used:** Clear is FPL's ✕, which
   asks first (e401f646d); the Checkpoints switch is
   "Route Checkpoints" in the Map card; Add Fuel Stops is the timeline's
   pill (the first item of Show Fuel Stops went with it); Refresh and Save
   and the solo cross-country review are the Brief's Share menu's; Type the
   Route is a keyboard button at Add a Stop's end; the checkpoints and the
   printed nav log are the Nav Log card's own Share's (the owner: "Print
   navlog should be in navlog share, not in more. Same with the
   checkpoints", 741ded143).
4. **File flight plan is a button of its own beside FPL's tab bar** (the
   owner: "File flight plan should be a separate button next to tabs",
   1eca2dafa): "File", its glyph over its word, in a capsule of the bar's
   glass and height, a gap-2 to its right, the pair centred together;
   greyed where the plan cannot be filed.

## Consequences

- rules.md §4a and web.md say where each action lives; the specs reach
  each by its new home (`openBriefMenu` for Save, FPL's ✕ for Clear).
- The owner's "one home per control" (0014) holds: no action is in two
  places.
- The phones keep their menus until the owner's word (decision 0038).
