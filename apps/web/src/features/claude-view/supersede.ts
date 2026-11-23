/**
 * The newest live view of the flight keeps the say over older ones in
 * the conversation: Claude mounts a view for every answer and unmounts
 * none, and only the newest should change the flight or tell the model
 * about it (claude.com/docs/connectors/building/mcp-apps/instance-
 * supersession). Every view of the connector shares one sandbox origin, so
 * each says its answer's server-made key on a BroadcastChannel, and one
 * that hears a newer key stands down. A view that takes a newer answer
 * (a tap of its own) says so and has the say again.
 *
 * The channel is named by the server for the pilot and this connector
 * (app/mcp/flight_view channel_of, a key only it holds), and only a
 * well-formed key is heard: another connector's view on the same sandbox
 * origin can neither find the channel nor stand these views down with a
 * made-up one (the security review of 2026-11-22).
 */
export interface ViewKey {
  createdAt: number;
  seq: number;
}

type Heard = ViewKey & { id: string; kind: "hello" | "here" };

const CHANNEL = "wingtip-flight-view";

/** Whether `other` is newer than `mine`: the time, then the count, then the view's id. */
export function isNewer(other: ViewKey & { id: string }, mine: ViewKey & { id: string }): boolean {
  if (other.createdAt !== mine.createdAt) return other.createdAt > mine.createdAt;
  if (other.seq !== mine.seq) return other.seq > mine.seq;
  return other.id > mine.id;
}

/** Whether a message heard is a view's key, not something else on the channel. */
const isHeard = (m: unknown): m is Heard => {
  const h = m as Partial<Heard> | null;
  return (
    !!h && typeof h.id === "string" && Number.isFinite(h.createdAt) && Number.isFinite(h.seq) && (h.kind === "hello" || h.kind === "here")
  );
};

/** Joins the views' channel, the one the server named (`name`): `say`
 *  gives this view's key once it has one, `onSuperseded` hears whether a
 *  newer view is open. Returns the leave. */
export function joinViews(
  id: string,
  name: string,
  onSuperseded: (superseded: boolean) => void,
): { say: (key: ViewKey) => void; leave: () => void } {
  if (typeof BroadcastChannel === "undefined") return { say: () => {}, leave: () => {} };
  const channel = new BroadcastChannel(`${CHANNEL}:${name}`);
  const others = new Map<string, ViewKey>();
  let mine: ViewKey | null = null;
  const judge = () => {
    if (mine) onSuperseded([...others].some(([other, key]) => isNewer({ ...key, id: other }, { ...mine!, id })));
  };
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const heard = event.data;
    if (!isHeard(heard) || heard.id === id || !mine) return;
    if (heard.kind === "hello") channel.postMessage({ ...mine, id, kind: "here" } satisfies Heard);
    others.set(heard.id, { createdAt: heard.createdAt, seq: heard.seq });
    judge();
  };
  return {
    say: (key) => {
      mine = key;
      channel.postMessage({ ...key, id, kind: "hello" } satisfies Heard);
      judge();
    },
    leave: () => channel.close(),
  };
}
