import { useQuery } from "@tanstack/react-query";
import { googleMapsQuery } from "../../queryClient";
import { keptStore } from "../../storage";

/** Google's Map Tiles API: a session for a kind of map, then its tiles. */
export const GOOGLE = "https://tile.googleapis.com";

/**
 * The site's origin, and only that, as the Referer of every request to
 * Google: the key is restricted to this site's address in Google Cloud
 * (docs/GOOGLE-MAPS.md), which Google checks against the Referer, and the
 * page's own policy (no-referrer, SecurityConfig) would send none -- so a
 * restricted key was refused and only an open one worked (the security
 * audit's M4, 2026-11-10). Every other request keeps sending none.
 */
export const GOOGLE_REFERRER_POLICY: ReferrerPolicy = "strict-origin";

/** MapLibre's transformRequest: Google's tiles with the site's origin as
 *  their Referer, every other request as it was. */
export function googleReferrer(url: string): { url: string; referrerPolicy: ReferrerPolicy } | undefined {
  return url.startsWith(`${GOOGLE}/`) ? { url, referrerPolicy: GOOGLE_REFERRER_POLICY } : undefined;
}

/** A session's 2D tiles, for a MapLibre raster source. */
export const googleTiles = (session: string, key: string) =>
  `${GOOGLE}/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(key)}`;

interface Session {
  session: string;
  expiry: number;
  key: string;
}

/**
 * A Google map session for a kind of map, kept in the browser until a day
 * before it runs out (two weeks, Google says): a session's tiles are one
 * set, asked for once rather than with every page. A session belongs to
 * the key that made it, so one made with another key (rotated since) is
 * not reused: Google refuses its tiles. The satellite's has
 * Google's roads and names over it, as its Satellite view does; the
 * imagery's is the same pictures bare, what the map shows close in past
 * the chart's own detail (CloseImageryGl), under the app's own marks.
 */
type GoogleKind = "map" | "satellite" | "imagery";

async function googleSession(key: string, kind: GoogleKind): Promise<Session> {
  const kept = keptStore<Session | null>(`wingtip.googleSession.${kind}`, null);
  // No storage: a new session.
  const held = kept.getState().value;
  if (held && held.key === key && held.expiry * 1000 - Date.now() > 24 * 3600_000) return held;
  const resp = await fetch(`${GOOGLE}/v1/createSession?key=${encodeURIComponent(key)}`, {
    method: "POST",
    referrerPolicy: GOOGLE_REFERRER_POLICY,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      kind === "map"
        ? { mapType: "roadmap", language: "en-US", region: "US", imageFormat: "png" }
        : kind === "satellite"
          ? { mapType: "satellite", language: "en-US", region: "US", layerTypes: ["layerRoadmap"] }
          : { mapType: "satellite", language: "en-US", region: "US" },
    ),
  });
  if (!resp.ok) throw new Error(`Google's map session: ${resp.status}`);
  const answer = (await resp.json()) as { session: string; expiry: string };
  const session = { session: answer.session, expiry: Number(answer.expiry), key };
  // Kept for this page only where storage is refused.
  kept.setState({ value: session });
  return session;
}

/** Google's session for a kind of map, once the deployment's key is known;
 *  its error is for the settings to say (MapSettings). */
export function useGoogleSession(kind: GoogleKind, wanted = true) {
  const { data: google } = useQuery(googleMapsQuery);
  return useQuery({
    queryKey: ["googleSession", kind, google?.key],
    queryFn: () => googleSession(google!.key, kind),
    enabled: wanted && !!google,
    staleTime: 24 * 3600_000,
    meta: { silent: true },
  });
}
