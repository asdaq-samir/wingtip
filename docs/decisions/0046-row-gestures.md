# 0046. A row is swiped away and held to move, by React Aria's own recipe and the browser's own drag

- **Date:** 2026-11-17
- **Status:** Accepted

## Context

The owner, 2026-11-17: "Can we add swipe gesture to remove and hold/drag
to move etc like iPhone?" His standing rules: stock components and wiring
over hand-built ("I don't want to have bugs with hand built things";
research libraries first, newest versions), the platform's own feel,
tokens only, 44-point hit areas, and Undo kept. A swipe written by hand
over a scroller of our own (SwipeToDelete) was taken out on 2026-11-10
for the stock row menu (RowMenu: its ••• and Base UI's ContextMenu's long
press), so the swipe comes back only as a stock part. The lists are React
Aria's GridList where rows move (FPL's `RouteGrid`, Favorites'
`SortableRows`) and the app's own grouped rows elsewhere, all inside Base
UI's Drawer, whose own swipe moves the sheet.

What was checked, 2026-11-17:

- **React Aria Components 1.22.1** (2026-10-09): GridList has no swipe
  actions and no RFC for them; React Aria publishes an "iOS List View"
  example instead -- a GridList with "swipe gestures, layout animations,
  and multi selection", built with Motion
  (https://react-aria.adobe.com/examples/ios-list). Its drag and drop
  (`useDragAndDrop`) supports "mouse, touch, keyboard, and screen reader
  interactions" (https://react-aria.adobe.com/dnd); its `useDrag` sets
  `draggable="true"` on the row itself (GridListItem spreads `dragProps`
  on the row, the drag button only adding the keyboard's and VoiceOver's
  way), so a touch screen's long press is the browser's own drag.
- **Browsers:** Safari on the iPhone lifts a `draggable` element on a long
  press from iOS 15, Chrome on Android from about Chrome 96 to 100
  (blink-dev, "Simultaneous touch-drag and context-menu is getting enabled
  on Android 100+"); both draw the system's own lift and preview.
- **Base UI 1.9.0** (2026-10-09): Drawer, Toast and ContextMenu swipe or
  hold, but no list row's swipe action. Its Drawer leaves a sideways drag
  to an element marked `data-base-ui-swipe-ignore="x"` and keeps the
  upright one (DrawerViewport's cross-axis arbitration).
- **shadcn's registry:** no swipe-to-delete row.
- **Motion 14.14.0** (2026-11-13): `drag="x"`, `dragControls`,
  `dragDirectionLock`, springs and `useMotionValue`; the library React
  Aria's example uses.
- **@use-gesture/react 10.3.1** (last release 2024-03), **react-swipeable
  7.0.2** (gestures only, no row), **react-swipeable-list 1.10.0**
  (2024-10, its own list markup, not a GridList's): each older, or a list
  of its own beside React Aria's.

## Decision

1. **Swipe to remove is React Aria's own iOS List View recipe on
   Motion** (`components/SwipeRow`, its swipe in `components/swipe`): a
   swipe to the left on a row uncovers a red button with the list's own
   word (Remove), which widens with the row; past 60% of the row it fills
   it, the finger feels it where the browser can (`feel("detent")`), and
   letting go there removes the row. The button and the full swipe call
   the row menu's own handler, so the toast's Undo and the plan's Undo
   are the same as the menu's. A tap anywhere while a row is open closes
   it. A finger or a pen only (no hover); a mouse, a keyboard and
   VoiceOver keep the row's menu, the button inert until uncovered. Off
   in a list's Edit, as iOS's are. The row carries
   `data-base-ui-swipe-ignore="x"`, so a sideways drag is the row's and an
   upright one the sheet's or the list's scroll (Motion's direction lock).
2. **Where:** every list row whose menu has Remove (RowMenu's `swipe`,
   RemovableRow's rows by default): the airports' and airplanes' Recents
   and Favorites, Home and your Airplane, the routes' Recents, saved
   Flights and the logbook's flights; and FPL's route list, a stop the
   pilot typed (`stopRemoval`, the same rows its menu offers Remove on).
   The departure and the destination are not removed from the list, as
   their menus have no Remove.
3. **Hold to move is the browser's own drag through React Aria.** A
   touch and hold anywhere on a movable row of FPL's list lifts it with the system's lift and preview; the stock drop
   line shows where it goes. The row's words are not selected by the hold
   (`select-none`, no callout). The grip stays: it shows only where the
   list edits the route, as iOS's reorder control shows only in Edit, and
   it is React Aria's drag button for the keyboard and VoiceOver.
4. **Not in the first load.** Motion is on the swipe's own chunk, asked
   for only on a touch screen (`lazyModule`, shared with the popups'
   chunk): the first load went from 1,016,125 to 1,016,255 bytes, the
   gate alone; the chunk is 162 KB, 54 KB gzipped.

## Consequences

- A row's swipe and its long press do not cross: the swipe starts on a
  sideways move, the ContextMenu's or the drag's hold on a finger kept
  still.
- Until the chunk is in, a row draws as itself and swaps once to its
  swipeable self.
- The full-swipe line (60%) and the flick speed are the app's choice
  (`components/swipe/swipeEnd`), against the example's 80%.
- The phones keep their own stock swipe actions (SwiftUI's
  `swipeActions`, Material's `SwipeToDismissBox`) when the owner asks for
  them there (decision 0038).
