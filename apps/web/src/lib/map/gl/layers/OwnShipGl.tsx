import type { MapGeoJSONFeature, Marker } from "maplibre-gl";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { SHEET_SECONDS } from "../../../mapChrome";
import { underway } from "../../position/glide";
import { ownShipHtml } from "../../marks/icons";
import { usePreferences } from "../../../preferences";
import { drawOwnShip, ownShipMarker, placeOwnShip } from "./ownShipMarker";
import { useOwnShip } from "../../position/ownShip";
import { useGlMap } from "../glLayer";
import { glZoom } from "../glStyle";
import { cameraOf } from "../camera";
import { TAP } from "./common";
import { pictureLayer } from "../markLayers";
import { svgPicture, useGlSymbols, type GlSymbol } from "../useGlSymbols";

/** Own ship's room on the chart, an empty picture the size of its plane
 *  and a little round it, which MapLibre's collision keeps clear: the
 *  marker is HTML over the canvas, which the collision does not see, so
 *  KORD's ident was drawn under the arrow (the owner's iPhone screenshot,
 *  2026-11-23). Always drawn, and placed first, the top of the marks, so
 *  every label gives way round it (rules.md, "Where words collide"). */
const ROOM = "own-ship-room";
const ROOM_PICTURE = svgPicture(ROOM, () => '<svg width="40" height="40"></svg>');
const ROOM_LAYERS = [pictureLayer(ROOM, ROOM, {}, { "icon-ignore-placement": false })];

/** The location arrow's close-in, in the app's levels. */
const LOCAL_ZOOM = 9;

/** The last recentre (own ship's `recentred`) flown to or let go, kept for
 *  the page rather than the map's mount: locateOnOpen asks for the position
 *  as the page opens, and when the map came up after that ask it took the
 *  ask as done already, so the first fix was only followed, at the
 *  country's zoom (sheet-fly-here's KMSN never drawn, 3 runs in 8). A map
 *  made again still does not fly to an old recentre. */
let flownRecentre = 0;

/**
 * Own ship as a MapLibre marker: an element the map places in the same
 * frame it draws the chart, so it stays on its point through a pinch, at
 * the GPS's heading on the map (rotationAlignment). Followed only while
 * the pilot's follow is on -- Apple Maps' tracking mode, which the
 * location arrow sets and a drag or a pick ends (the camera's owner,
 * lib/map/gl/camera) -- the arrow's tap bringing the map to it
 * (recentred), a pick; a drag before the first fix comes lets that go
 * too. Each fix is a step of the owner's follow, one linear ease lasting
 * till the next fix, so the dry run's four fixes a second move the map at
 * one steady pace rather than starting and stopping at each (the flicker
 * audit's FL-13). Grey at its last place when own ship is turned off (the
 * owner, 2026-10-06).
 */
export function OwnShipGl({ card }: { card?: ReactNode } = {}) {
  const { map, addTap, openCard } = useGlMap();
  // How it is drawn, the Map card's Own Ship (lib/map/position/ownShipLook).
  const look = usePreferences((s) => s.ownShipLook);
  const enabled = useOwnShip((s) => s.enabled);
  const fix = useOwnShip((s) => s.fix);
  const simulated = useOwnShip((s) => s.simulated);
  const follow = useOwnShip((s) => s.follow);
  const recentred = useOwnShip((s) => s.recentred);
  const recentreZoom = useOwnShip((s) => s.recentreZoom);
  // The room moved a thousandth of a degree at a time (about 100 m: a
  // few pixels at a flight's zooms, within the plane's own picture), so a
  // fix that only jitters on the ground sets no new data (the code audit
  // of 2026-11-23, R5-20).
  const roomLat = fix ? Math.round(fix.lat * 1000) / 1000 : null;
  const roomLon = fix ? Math.round(fix.lon * 1000) / 1000 : null;
  const room = useMemo<GlSymbol[]>(
    () => (roomLat === null || roomLon === null ? [] : [{ key: ROOM, lat: roomLat, lon: roomLon, picture: ROOM_PICTURE }]),
    [roomLat, roomLon],
  );
  useGlSymbols(ROOM, ROOM_LAYERS, room);
  const marker = useRef<Marker | null>(null);
  // The mark's HTML as last written (drawOwnShip).
  const drawn = useRef("");
  const flown = useRef(flownRecentre);
  useEffect(() => {
    marker.current = ownShipMarker();
    // A drag ends the follow (the camera's owner), and a flight to the
    // position still waiting on its fix is let go.
    const stop = (e: { originalEvent?: Event }) => {
      if (e.originalEvent) flown.current = flownRecentre = useOwnShip.getState().recentred;
    };
    map.on("dragstart", stop);
    return () => {
      map.off("dragstart", stop);
      marker.current?.remove();
      marker.current = null;
    };
  }, [map]);
  useEffect(() => {
    const m = marker.current;
    if (!m) return;
    if (!fix) {
      m.remove();
      return;
    }
    // The app's own mark (icons.ts ownShipHtml, with the
    // `data-own-ship` the specs find), turned by the marker to the heading.
    const heading = enabled ? fix.headingDeg : null;
    drawOwnShip(m, drawn, ownShipHtml(heading == null ? null : 0, !enabled, look, enabled && (simulated || underway(fix))));
    placeOwnShip(m, map, [fix.lon, fix.lat], heading ?? 0);
  }, [map, fix, enabled, simulated, look]);
  useEffect(() => {
    if (!fix || !enabled) return;
    const camera = cameraOf(map);
    const intent = simulated ? "dry-run" : "own-ship";
    if (flown.current !== recentred) {
      flown.current = flownRecentre = recentred;
      // A recentre still waiting on its first fix is let go once the
      // follow it started has ended, as a drag lets it go: a route opened
      // by link, fitted while a desktop's Wi-Fi fix took seconds to come,
      // was left for own ship at the open's zoom when the fix came (the
      // owner's desktop, 2026-11-21, Wisconsin for a route to KPWK;
      // desk-route-link.spec). The fit ended the follow (camera's
      // endFollows); the recentre had asked for it before the route came.
      if (!follow) return;
      const zoom = recentreZoom !== null ? glZoom(recentreZoom) : Math.max(map.getZoom(), glZoom(LOCAL_ZOOM));
      camera.pick([fix.lon, fix.lat], { zoom, duration: SHEET_SECONDS * 2000, keeps: intent });
      return;
    }
    // Not over the arrow's move in: the owner lets the follow's steps go
    // by while a pick has the camera, as the next fix's ease, a quarter
    // second on in a dry run, stopped it part way, the map left two
    // levels short of the run's zoom (dry-run.spec, 2026-11-13).
    if (follow) camera.follow(intent, [fix.lon, fix.lat]);
  }, [map, fix, enabled, simulated, follow, recentred, recentreZoom]);
  // A tap on it its card (`card`), as Apple Maps' My Location opens one:
  // in the map's one tap, before anything under it, within a finger's
  // reach of where it is drawn. The marker itself stays untouchable, so a
  // drag that starts on it moves the map.
  useEffect(() => {
    if (!card) return;
    return addTap({
      layers: [],
      reach: TAP.mark,
      rank: TAP.rank.field - 1,
      find: (point) => {
        const { enabled: on, fix: f } = useOwnShip.getState();
        if (!on || !f) return null;
        const p = map.project([f.lon, f.lat]);
        if (Math.hypot(p.x - point.x, p.y - point.y) > TAP.mark) return null;
        return {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [f.lon, f.lat] },
        } as unknown as MapGeoJSONFeature;
      },
      onTap: () => openCard(card),
    });
  }, [map, addTap, openCard, card]);
  return null;
}
