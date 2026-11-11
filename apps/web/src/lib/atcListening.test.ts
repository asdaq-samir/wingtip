// @vitest-environment jsdom
/**
 * Both ways of listening (lib/atcListening) through the input lib/
 * audioInput holds: the held track handed to lib/listen, and, after a
 * reload, the outside input remembered asked for in the same tap before
 * the recognizer starts. lib/listen is a stand-in recording what it was
 * given; the browser's devices are stand-ins as in audioInput.test.
 *
 * Deterministic in a shuffled, loaded run: nothing waits on a guessed
 * number of ticks (each step waits for the state it asserts), each test
 * stops what it started and lets go of the input, so no timer of one
 * test's modules (listenOnce's 15 s and 30 s, the hold's 1 s check) fires
 * in another's, and the timeouts allow for a busy machine.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const order: string[] = [];
const sessions: { onEnded: (error?: string) => void; track?: () => MediaStreamTrack | null; renew: ReturnType<typeof vi.fn> }[] = [];

vi.mock("./listen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./listen")>()),
  listen: vi.fn(
    async (
      _words: string[],
      _pattern: unknown,
      _heard: unknown,
      onEnded: (error?: string) => void,
      track?: () => MediaStreamTrack | null,
    ) => {
      order.push("recognizer");
      const renew = vi.fn();
      sessions.push({ onEnded, track, renew });
      return { stop: () => onEnded(), renew };
    },
  ),
}));

const PANEL = { id: "gma", label: "GMA 350c" };
let pending: (() => void)[];

function stubBrowser() {
  const devices = Object.assign(new EventTarget(), {
    enumerateDevices: vi.fn(async () => [{ kind: "audioinput", deviceId: "gma", label: "GMA 350c", groupId: "" }]),
    getUserMedia: vi.fn((constraints: { audio: { deviceId?: { exact: string } } }) => {
      order.push("capture");
      const label = constraints.audio.deviceId ? "GMA 350c" : "iPhone Microphone";
      const track = Object.assign(new EventTarget(), {
        kind: "audio",
        readyState: "live",
        label,
        getSettings: () => ({ deviceId: "gma" }),
        stop: vi.fn(),
      });
      const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
      return new Promise((resolve) => pending.push(() => resolve(stream)));
    }),
  });
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone) Safari/605.1.15", mediaDevices: devices });
  return devices;
}

async function load() {
  const listening = await import("./atcListening");
  const { useAtcRadio } = await import("./atcRadio");
  const { usePreferences } = await import("./preferences");
  const audio = await import("./audioInput");
  loaded = listening;
  return { ...listening, useAtcRadio, usePreferences, audio };
}

/** Generous for a full, shuffled run on a loaded machine: a test that
 *  passes takes a fraction of a second. */
const WAIT = { timeout: 10_000, interval: 5 };
vi.setConfig({ testTimeout: 30_000 });

/** The listening module a test loaded, so afterEach can stop what it started. */
let loaded: { stopRadio: () => void } | null = null;

/** The held prompt answered, once the module has asked for it: taken at
 * once, it failed now and then in a full, loaded run (pending empty) when
 * the ask was still a few awaits away. */
async function answerPrompt() {
  await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0), WAIT);
  pending.shift()!();
}

beforeEach(() => {
  vi.resetModules();
  loaded = null;
  order.length = 0;
  sessions.length = 0;
  pending = [];
  localStorage.clear();
});

afterEach(() => {
  // Whatever is still listening ends here, its timers cleared with it.
  loaded?.stopRadio();
  loaded = null;
  vi.unstubAllGlobals();
});

describe("listening through the input held", () => {
  test("the radio and the microphone each hand lib/listen the held track", async () => {
    stubBrowser();
    const m = await load();
    const card = m.audio.hold();
    const opened = m.audio.choose(PANEL);
    await answerPrompt();
    await opened;
    const held = m.audio.heldTrack();
    expect(held?.label).toBe("GMA 350c");

    await m.startRadio([]);
    expect(sessions[0]!.track?.()).toBe(held);
    m.stopRadio();
    await m.listenOnce([]);
    expect(sessions[1]!.track?.()).toBe(held);
    m.stopRadio();
    // The card's hold keeps it after both.
    expect(m.audio.heldTrack()).toBe(held);
    card();
    expect(m.audio.heldTrack()).toBeNull();
  });

  test("after a reload, the same tap asks for the outside input remembered before the recognizer starts, and does not wait on it", async () => {
    const devices = stubBrowser();
    const m = await load();
    m.usePreferences.setState({ listenInput: PANEL });
    await m.startRadio([]);
    expect(order).toEqual(["capture", "recognizer"]);
    // Not yet answered: the recognizer started without it.
    expect(devices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(sessions[0]!.track?.()).toBeNull();
    await answerPrompt();
    await vi.waitFor(() => expect(sessions[0]!.track?.()?.label).toBe("GMA 350c"), WAIT);
    expect(m.useAtcRadio.getState().input).toMatchObject({ label: "GMA 350c", outside: true, lost: false });
    m.stopRadio();
    expect(m.useAtcRadio.getState().input).toBeNull();
  });
});

describe("nothing heard", () => {
  test("through an outside input the recognizer is handed (Chrome and Edge, Firefox, on the desktop), the pill names it, in words for a panel or a cable", async () => {
    stubBrowser();
    vi.stubGlobal("SpeechRecognition", class {});
    const m = await load();
    m.usePreferences.setState({ listenInput: PANEL });
    await m.listenOnce([]);
    await answerPrompt();
    // The input is named once its track is held (lib/audioInput's adopt).
    await vi.waitFor(() => expect(m.useAtcRadio.getState().input).toMatchObject({ label: "GMA 350c" }), WAIT);
    expect(m.useAtcRadio.getState().pill?.listening).toBe(true);
    sessions[0]!.onEnded();
    expect(m.useAtcRadio.getState().pill?.error).toBe(
      "Nothing was heard through GMA 350c. Check it is sending the radio: an audio panel's recording mode, or the cable.",
    );
  });

  test("in Safari, whose recognizer is not known to hear the input held, the words as they were", async () => {
    stubBrowser();
    const m = await load();
    m.usePreferences.setState({ listenInput: PANEL });
    await m.listenOnce([]);
    await answerPrompt();
    await vi.waitFor(() => expect(m.useAtcRadio.getState().input).toMatchObject({ label: "GMA 350c", lost: false }), WAIT);
    sessions[0]!.onEnded();
    expect(m.useAtcRadio.getState().pill?.error).toBe("Nothing was heard. Tap the microphone and speak, or hold the phone to the speaker.");
  });

  test("through the phone's own microphone, the words as they were", async () => {
    stubBrowser();
    const m = await load();
    await m.listenOnce([]);
    sessions[0]!.onEnded();
    expect(m.useAtcRadio.getState().pill?.error).toBe("Nothing was heard. Tap the microphone and speak, or hold the phone to the speaker.");
  });
});

describe("one recognizer at a time", () => {
  test("the radio or the microphone started stops the ATIS being heard first", async () => {
    stubBrowser();
    const m = await load();
    const atis = vi.fn();
    m.useAtcRadio.setState({ atisStop: atis });
    await m.listenOnce([]);
    expect(atis).toHaveBeenCalledTimes(1);
    m.stopRadio();
    await m.startRadio([]);
    expect(atis).toHaveBeenCalledTimes(2);
    m.stopRadio();
  });
});
