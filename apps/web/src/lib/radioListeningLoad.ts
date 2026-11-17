/** The listening code (lib/atcListening), fetched as the pill comes so a
 *  chip's tap starts the readback at once: Safari lets a page listen only
 *  straight from the tap (RadioButton loads it the same way). */
let listening: typeof import("../lib/atcListening") | null = null;
export const load = () => import("../lib/atcListening").then((m) => (listening = m));

/** A readback listened for at the chip's tap, from the code already fetched where it is. */
export function readBackNow(text: string) {
  if (listening) void listening.listenOnce([], text);
  else void load().then((m) => m.listenOnce([], text));
}
