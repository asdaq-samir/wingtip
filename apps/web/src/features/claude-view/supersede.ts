/**
 * The newest live view of the flight keeps the say over older ones in
 * the conversation: Claude mounts a view for every answer and unmounts
 * none, and only the newest should change the flight or tell the model
 * about it (claude.com/docs/connectors/building/mcp-apps/instance-
 * supersession). Every view of the connector shares one sandbox origin, so
 * each says its answer's server-made key on a BroadcastChannel, and one
 * that hears a newer key stands down. A view that takes a newer answer
 * (a tap of its own) says so and has the say again.
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

/** Joins the views' channel: `say` gives this view's key once it has one,
 *  `onSuperseded` hears whether a newer view is open. Returns the leave. */
export function joinViews(id: string, onSuperseded: (superseded: boolean) => void): { say: (key: ViewKey) => void; leave: () => void } {
  if (typeof BroadcastChannel === "undefined") return { say: () => {}, leave: () => {} };
  const channel = new BroadcastChannel(CHANNEL);
  const others = new Map<string, ViewKey>();
  let mine: ViewKey | null = null;
  const judge = () => {
    if (mine) onSuperseded([...others].some(([other, key]) => isNewer({ ...key, id: other }, { ...mine!, id })));
  };
  channel.onmessage = (event: MessageEvent<Heard>) => {
    const heard = event.data;
    if (!heard || heard.id === id || !mine) return;
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
