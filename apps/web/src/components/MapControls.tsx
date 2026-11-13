import { lazy, Suspense } from "react";
import { cn } from "cn";
import { Button } from "./ui/button";
import FlownTrackButton from "./FlownTrackButton";
import FullscreenButton from "./FullscreenButton";
import MyPositionButton from "./MyPositionButton";
import MapSettingsButton, { MapSettingsCard } from "./MapSettingsButton";
import RadioButton from "./RadioButton";
import ThreeDButton from "./ThreeDButton";
import PageToggle from "./PageToggle";
import ClearanceKey from "./ClearanceKey";
import { useAtcRadio } from "../lib/atcRadio";
import { useIsMobile } from "../hooks/use-mobile";
import { FLYING_BUTTON, FLYING_STACK, GLASS, useFlying } from "../lib/mapChrome";
import { EngineGate } from "../lib/engine/engineGate";
import { OnSheetTop } from "./sheet/sheetTop";

/**
 * The map's buttons, in one group floating over the chart, as Maps
 * stacks its own: the map's settings, the pilot's own position (the
 * location arrow), and full screen where it works. A zoom toggle, between the whole route and the
 * selected point, went: picking a waypoint brings the map to it. On a
 * phone's bottom sheet at the right just over its top edge, the search's
 * row, riding it as the 3D and the page toggle do at the left (the owner,
 * 2026-11-11: "keep the top right map button to just above the search bar
 * on the right"); over a top sheet at the bottom right, riding its edge;
 * beside a desktop's side panel at the bottom right. Over them, a circle
 * of its own, the radio's button, on a phone as on a desktop. On a phone
 * the toggle that turns the sheet's pages (PageToggle) is at the left
 * under the 3D; from md up, a circle of its own under the group.
 *
 * Ghost buttons on the group's glass, eight apart inside it, so
 * each one's 44-point hit area (index.css) meets the next one's rather
 * than overlapping it. Only the location arrow in the tint, as Maps'
 * is; the others' glyphs in the text's colour.
 *
 * In flight (useFlyingMode, the canvas's Flying screen, 2026-11-03) the
 * stack is two 60-point words a hand finds in turbulence -- NRST, the
 * fields nearest own ship, and D→, direct to the next landing -- and the
 * microphone's circle grows to the same size where it is; the
 * settings, the arrow and the rest wait for the ground. The map follows the
 * airplane in flight (OwnShipGl), so the arrow is not missed.
 */
/** The microphone's pill, in RadioLayer's chunk with the rest of the
 *  radio's words: fetched as the mic is first tapped, never on the
 *  first load. */
const RadioPill = lazy(() => import("./RadioLayer").then((m) => ({ default: m.RadioPill })));

/** Drawn once the shared engine is there (lib/engine/engineGate), which
 *  it asks as it draws: the chart under it draws at once (MapPage). */
export default function MapControls() {
  return (
    <EngineGate>
      <MapControlsDrawn />
    </EngineGate>
  );
}

function MapControlsDrawn() {
  const flying = useFlying((s) => s.flying);
  const nearest = useFlying((s) => s.nearest);
  const direct = useFlying((s) => s.direct);
  const pill = useAtcRadio((s) => s.pill !== null);
  // The pill heard and done (its words or why not, its ✕ there): the mic
  // beside its close put away, at the owner's ask ("No mic button needed
  // next to close button on top", 2026-11-04); while it listens the mic
  // stays, its waveform saying so.
  const pillDone = useAtcRadio((s) => s.pill !== null && !s.pill.listening);
  // The mic a button of its own over the map's buttons at the right (the
  // owner, 2026-11-06: "move the headset button as a separate button on
  // the right above other floating buttons"), on a phone too since the
  // page toggle took its place at the left (the owner, 2026-11-13:
  // "replace the radio button on the left with the fpl toggle but below
  // 3d").
  const onPhone = useIsMobile();
  // The circle is the pill too: tapped, it widens into the listening pill
  // (RadioPill), easing through a grid column from 0fr to 1fr. In the
  // column at the right edge it widens to the left, its mic staying where
  // it was. On a phone over the whole width less the
  // margins, above the group and the 3D and the toggle at the left (the
  // pill's foot is level with the toggle's top or higher); from md up
  // clear of the side panel.
  const mic = (
    <div
      data-map-food=""
      className={cn(
        "z-[1000] flex flex-row-reverse items-end rounded-4xl p-1",
        onPhone ? "max-w-[min(28rem,calc(100vw-1rem))]" : "max-w-[min(28rem,calc(100vw-30rem))]",
        GLASS,
      )}
      data-testid="mic-circle"
      data-listening={pill || undefined}
    >
      {/* In flight the mic alone grows to 60 points (FLYING_BUTTON), not
          the pill's chips. */}
      <span className={cn("flex shrink-0 [&_button]:rounded-full", flying && "[&_button]:size-[60px]", pillDone && !flying && "hidden")}>
        <RadioButton />
      </span>
      <div
        className="grid min-w-0 transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateColumns: pill ? "1fr" : "0fr" }}
      >
        <div className="min-w-0 overflow-hidden">
          {pill && (
            <Suspense fallback={null}>
              <RadioPill />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
  // The group of buttons, one soft card of glass.
  const group = (
    <div
      className={cn(
        // One soft rounded card of glass round them, as Apple Maps on
        // the web groups its map button over its location arrow (the
        // owner's screenshot, 2026-11-10); a button pressed or open a
        // rounded square in it.
        "flex flex-col gap-2 rounded-2xl p-1 [&_button]:rounded-xl",
        flying && FLYING_STACK,
        GLASS,
      )}
    >
      {flying ? (
        <>
          {nearest && (
            <Button
              type="button"
              variant="ghost"
              aria-label="Nearest airports"
              data-testid="flying-nearest"
              className={cn(FLYING_BUTTON, "text-(length:--type-note)")}
              onClick={nearest}
            >
              NRST
            </Button>
          )}
          {direct && (
            <Button
              type="button"
              variant="ghost"
              aria-label={`Direct to ${direct.to}`}
              data-testid="flying-direct"
              className={cn(FLYING_BUTTON, "text-base")}
              onClick={direct.go}
            >
              D→
            </Button>
          )}
          {/* The location arrow, 60 points as the rest: on the airplane,
            and in a dry run its other face the whole route (the
            owner's 2026-10-27 asks), which flying mode had put away
            (the owner's yes to the run's own controls back,
            2026-11-04). */}
          <MyPositionButton />
        </>
      ) : (
        <>
          {/* The map's settings first, as Maps' map button is. */}
          <MapSettingsButton />
          <MyPositionButton />
          {/* While a saved flight's flown track is on the chart. */}
          <FlownTrackButton />
          {/* Draws itself only where full screen actually works: a desktop
            browser and an iPad, never an iPhone. */}
          <FullscreenButton />
        </>
      )}
    </div>
  );
  return (
    <>
      {/* z-[1000]: over the map's canvas, its markers and its own
        controls; still inside the map's own stacking context, under the
        panel and every portal. The map's right edge is the screen's, so
        clear of a landscape phone's notch there. On a phone's bottom sheet
        drawn in the Drawer's popup (OnSheetTop), 24 over its top at the
        right, level with the 3D and the page toggle at the left and as they do:
        following a finger's drag, there over a card's nested drawer as it
        is, and giving way with the sheet all the way up (index.css). 24
        over the top clears the map's credit line at the bottom right
        (googleCredit); the radio's pill widens to the left above the group. With
        the sheet at the top, just under its edge at the bottom right,
        riding it; beside a desktop's side panel at the bottom right. */}
      {/* The Map button's card, beside what rides the sheet: drawn there
          it went with the buttons as they moved to the card's top. */}
      <MapSettingsCard />
      <OnSheetTop>
        {(riding) => (
          <div
            data-map-controls=""
            data-flying={flying || undefined}
            className={cn(
              // Only the buttons take a tap, not the room the pill's width
              // makes beside the group.
              "pointer-events-none z-[1000] flex flex-col items-end gap-2 [&>*]:pointer-events-auto",
              riding
                ? "absolute right-[max(0.5rem,env(safe-area-inset-right))] bottom-6"
                : "absolute right-[max(0.5rem,env(safe-area-inset-right))] bottom-[calc(max(env(safe-area-inset-bottom),var(--map-inset-bottom,0px))+1.5rem)] nav-bottom:top-[max(0.5rem,env(safe-area-inset-top))] nav-bottom:bottom-auto",
            )}
          >
            {/* In flight the mic's grown circle (FLYING_BUTTON's 60) over
                NRST, D→ and the arrow's stack, the left column then empty. */}
            {mic}
            {/* The 3D button, its own circle under the mic's (ThreeDButton);
                on the ground only, as the settings are. */}
            {!onPhone && !flying && (
              // Its key to the 3D ground's colours at its left, clear of the route's side panel.
              <div className="flex flex-row-reverse items-center gap-2">
                <ThreeDButton />
                <ClearanceKey />
              </div>
            )}
            {group}
            {/* From md up the sheet's pages turned (PageToggle), a circle of
                its own under the group; on a phone it is at the left. */}
            {!onPhone && <PageToggle />}
          </div>
        )}
      </OnSheetTop>
      {/* On a phone at the left, riding the sheet's top: the 3D button, a
        circle of its own (ThreeDButton), on the ground only, as the map's
        settings are, and under it, nearest the sheet, the page toggle
        (PageToggle), in the radio's button's place (the owner, 2026-11-13:
        "replace the radio button on the left with the fpl toggle but below
        3d"). Two circles 8 apart, each tap its own 44 points. Over a bottom
        sheet drawn in the Drawer's popup (OnSheetTop), so they follow a
        finger's drag as Apple Maps' buttons do. In flight neither is drawn. */}
      {onPhone && (
        <OnSheetTop>
          {(riding) => (
            <div
              className={cn(
                // Only the circles take a tap, not the room between them.
                "pointer-events-none z-[1000] flex flex-col items-start gap-2 [&>*]:pointer-events-auto",
                riding
                  ? "absolute bottom-6 left-[max(0.5rem,env(safe-area-inset-left))]"
                  : "absolute bottom-[calc(max(env(safe-area-inset-bottom),var(--map-inset-bottom,0px))+1.5rem)] left-[calc(max(0.5rem,env(safe-area-inset-left))+var(--map-inset-left,0px))]",
              )}
            >
              {!flying && (
                // Its key to the 3D ground's colours at its right, over the
                // chart's edge rather than the route's middle.
                <div className="flex items-center gap-2">
                  <ThreeDButton />
                  <ClearanceKey />
                </div>
              )}
              <PageToggle />
            </div>
          )}
        </OnSheetTop>
      )}
    </>
  );
}
