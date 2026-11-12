// @vitest-environment jsdom
/**
 * The browser's recognizer as lib/listen drives it, against a stand-in
 * that records what each start() was handed: the held input's track where
 * it is live (Chrome and Edge 135+, Firefox 160 on the desktop hear it;
 * Safari ignores it), the default input where the track will not do, a
 * fresh read of the track at each restart, and the start itself still in
 * the tap. Every recognizer is told to process locally, and nothing is
 * started where the browser cannot promise that (lib/speechLocal).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NEEDS_CONNECTION, listen, noMicrophone } from "./listen";
import { checkSpeech, forgetSpeechCheck, takesTrack } from "./speechLocal";

class Recognizer {
  static made: Recognizer[] = [];
  /** Throws as Chrome does for a track it will not take. */
  static refuseTracks = false;
  /** What Chrome's on-device check answers, and whether install worked. */
  static here = "available";
  static installs = 0;
  static available = vi.fn(async () => Recognizer.here);
  static install = vi.fn(async () => {
    Recognizer.installs++;
    return true;
  });
  lang = "";
  continuous = false;
  interimResults = false;
  processLocally = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  starts: unknown[][] = [];
  stop = vi.fn();
  constructor() {
    Recognizer.made.push(this);
  }
  start(...args: unknown[]) {
    this.starts.push(args);
    if (args.length && Recognizer.refuseTracks) {
      throw Object.assign(new Error("The MediaStreamTrack is not of kind 'audio' or is not of state 'live'."), {
        name: "InvalidStateError",
      });
    }
  }
}

const track = (readyState: "live" | "ended" = "live") => ({ kind: "audio", readyState }) as unknown as MediaStreamTrack;

beforeEach(async () => {
  Recognizer.made = [];
  Recognizer.refuseTracks = false;
  Recognizer.here = "available";
  Recognizer.installs = 0;
  vi.stubGlobal("SpeechRecognition", Recognizer);
  forgetSpeechCheck();
  await checkSpeech();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the recognizer's input", () => {
  test("a live track is handed to start()", async () => {
    const live = track();
    await listen(
      [],
      undefined,
      () => {},
      () => {},
      () => live,
    );
    expect(Recognizer.made[0]!.starts).toEqual([[live]]);
  });

  test("a track refused with InvalidStateError: start() again, on the default input", async () => {
    Recognizer.refuseTracks = true;
    const live = track();
    await listen(
      [],
      undefined,
      () => {},
      () => {},
      () => live,
    );
    expect(Recognizer.made[0]!.starts).toEqual([[live], []]);
  });

  test("an ended track, or none held: start() on the default input", async () => {
    await listen(
      [],
      undefined,
      () => {},
      () => {},
      () => track("ended"),
    );
    await listen(
      [],
      undefined,
      () => {},
      () => {},
    );
    await listen(
      [],
      undefined,
      () => {},
      () => {},
      () => null,
    );
    expect(Recognizer.made.map((r) => r.starts)).toEqual([[[]], [[]], [[]]]);
  });

  test("each restart reads the track afresh: a new choice is heard from the next", async () => {
    let held: MediaStreamTrack | null = null;
    await listen(
      [],
      undefined,
      () => {},
      () => {},
      () => held,
    );
    held = track();
    Recognizer.made[0]!.onend!();
    expect(Recognizer.made[1]!.starts).toEqual([[held]]);
  });

  test("started within listen(), before it is awaited: still in the tap", () => {
    void listen(
      [],
      undefined,
      () => {},
      () => {},
      () => track(),
    );
    expect(Recognizer.made).toHaveLength(1);
    expect(Recognizer.made[0]!.starts).toHaveLength(1);
  });

  test("renew starts afresh on the input now held, and what the old one says as it stops is no failure", async () => {
    const ended = vi.fn();
    let held = track();
    const { renew } = await listen(
      [],
      undefined,
      () => {},
      ended,
      () => held,
    );
    const first = Recognizer.made[0]!;
    held = track();
    renew();
    expect(first.stop).toHaveBeenCalled();
    first.onerror!({ error: "audio-capture" });
    first.onend!();
    expect(ended).not.toHaveBeenCalled();
    expect(Recognizer.made[1]!.starts).toEqual([[held]]);
  });
});

describe("on the device where it can be", () => {
  test("every recognizer is told to process locally, English asked for on the device", async () => {
    const { renew } = await listen(
      [],
      undefined,
      () => {},
      () => {},
    );
    renew();
    Recognizer.made[0]!.onend!();
    expect(Recognizer.made.map((r) => [r.processLocally, r.lang])).toEqual([
      [true, "en-US"],
      [true, "en-US"],
    ]);
    expect(Recognizer.available).toHaveBeenCalledWith({ langs: ["en-US"], processLocally: true });
  });

  test("a language pack to download: installed from the tap, then heard", async () => {
    Recognizer.here = "downloadable";
    forgetSpeechCheck();
    await checkSpeech();
    await listen(
      [],
      undefined,
      () => {},
      () => {},
    );
    expect(Recognizer.installs).toBe(1);
    expect(Recognizer.made).toHaveLength(1);
    expect(Recognizer.made[0]!.processLocally).toBe(true);
  });

  test("a recognizer that cannot promise the device (Safari, an older Chrome): the browser's own, not told to stay local", async () => {
    const made: Record<string, unknown>[] = [];
    class BrowserOnly {
      start = vi.fn();
      stop() {}
      constructor() {
        made.push(this as unknown as Record<string, unknown>);
      }
    }
    vi.stubGlobal("SpeechRecognition", undefined);
    vi.stubGlobal("webkitSpeechRecognition", BrowserOnly);
    forgetSpeechCheck();
    const ended = vi.fn();
    await listen([], undefined, () => {}, ended);
    expect(ended).not.toHaveBeenCalled();
    expect(made).toHaveLength(1);
    expect(made[0]!.processLocally).toBeUndefined();
    expect(made[0]!.start).toHaveBeenCalled();
  });

  test("on-device recognition unavailable: the browser's recognizer, not told to stay local", async () => {
    Recognizer.here = "unavailable";
    forgetSpeechCheck();
    await listen(
      [],
      undefined,
      () => {},
      () => {},
    );
    expect(Recognizer.made).toHaveLength(1);
    expect(Recognizer.made[0]!.processLocally).toBe(false);
  });

  test("no recognizer at all (Firefox): nothing starts", async () => {
    vi.stubGlobal("SpeechRecognition", undefined);
    vi.stubGlobal("webkitSpeechRecognition", undefined);
    forgetSpeechCheck();
    const ended = vi.fn();
    await listen([], undefined, () => {}, ended);
    expect(ended).toHaveBeenCalledWith("Speech can't be recognised on this device; type the clearance instead.");
  });
});

describe("its failures", () => {
  test("no microphone on an iPhone: what to check, and Safari opened again (WebKit bug 319706)", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 Version/26.1 Mobile/15E148 Safari/604.1",
    });
    const ended = vi.fn();
    await listen([], undefined, () => {}, ended);
    Recognizer.made[0]!.onerror!({ error: "audio-capture" });
    Recognizer.made[0]!.onend!();
    // clearance.spec's prefix kept.
    expect(ended).toHaveBeenCalledWith(
      "No microphone could be used. If a Bluetooth audio panel or headset was the input, check it is still connected; if it is, close Safari and open it again.",
    );
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 CriOS/142.0 Mobile/15E148 Safari/604.1",
    });
    expect(noMicrophone()).toMatch(/; if it is, close the browser and open it again\.$/);
  });

  test("no connection to the browser's recognizer: said as a connection, not the device", async () => {
    const ended = vi.fn();
    await listen([], undefined, () => {}, ended);
    Recognizer.made[0]!.onerror!({ error: "network" });
    Recognizer.made[0]!.onend!();
    expect(ended).toHaveBeenCalledWith(NEEDS_CONNECTION);
  });

  test("no microphone elsewhere: the page reloaded, not Safari", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/142.0 Safari/537.36",
      maxTouchPoints: 0,
    });
    expect(noMicrophone()).toBe(
      "No microphone could be used. If a Bluetooth audio panel or headset was the input, check it is still connected; if it is, reload the page.",
    );
  });
});

describe("which recognizers take a track", () => {
  test("the unprefixed one on a desktop; Safari's prefixed one and Android's never", () => {
    expect(takesTrack()).toBe(true);
    vi.stubGlobal("SpeechRecognition", undefined);
    vi.stubGlobal("webkitSpeechRecognition", Recognizer);
    expect(takesTrack()).toBe(false);
    vi.stubGlobal("SpeechRecognition", Recognizer);
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/142.0 Mobile" });
    expect(takesTrack()).toBe(false);
    // ChromeOS: Chromium's MediaStreamTrackWebSpeech is not stable there.
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (X11; CrOS x86_64 16181.0.0) AppleWebKit/537.36 Chrome/142.0 Safari/537.36" });
    expect(takesTrack()).toBe(false);
  });
});
