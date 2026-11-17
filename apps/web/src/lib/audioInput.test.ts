// @vitest-environment jsdom
/**
 * The input the radio is heard through (lib/audioInput), against stand-ins
 * for what Safari gives a page (audioInputFake). Each test has the module afresh, as a page load does.
 */
import { describe, expect, test, vi } from "vitest";
import { PANEL, answerPrompt, fake, load, settle, stubBrowser, installFakeBrowser } from "./audioInputFake";

installFakeBrowser();

describe("the inputs", () => {
  test("nothing is named before this page load's first grant (Find Inputs); after it, the inputs, built-in told from outside", async () => {
    stubBrowser();
    const m = await load();
    const release = m.hold();
    await m.refresh();
    expect(m.useInputs.getState().found).toBe(false);
    await m.find();
    await settle();
    expect(m.useInputs.getState()).toMatchObject({
      found: true,
      inputs: [
        { id: "iphone", label: "iPhone Microphone", outside: false },
        { id: "gma", label: "GMA 350c", outside: true },
      ],
    });
    release();
  });

  test("the device's own microphone by its name in each browser, and outside inputs", async () => {
    const { isOutside } = await load();
    for (const own of [
      "iPhone Microphone",
      "iPad Microphone",
      "MacBook Pro Microphone",
      "MacBook Air Microphone",
      "Default",
      "",
      "Default - MacBook Pro Microphone (Built-in)",
      "MacBook Pro Microphone (Built-in)",
      "Microphone Array (Realtek Audio)",
    ]) {
      expect(isOutside(own), own).toBe(false);
    }
    for (const outside of ["GMA 350c", "PMA450B", "AirPods Pro", "USB Audio", "Default - GMA 350c (Bluetooth)"]) {
      expect(isOutside(outside), outside).toBe(true);
    }
  });
});

describe("holds", () => {
  test("the input is held while anything holds it, and let go with the last: the track stopped, the context shut, nothing named", async () => {
    stubBrowser();
    const m = await load();
    const card = m.hold();
    await m.find();
    await m.pick("gma");
    const listening = m.hold();
    const track = fake.tracks.at(-1)!;
    card();
    card();
    expect(track.stop).not.toHaveBeenCalled();
    expect(m.heldTrack()).toBe(track);
    listening();
    expect(track.stop).toHaveBeenCalled();
    expect(fake.contexts[0]!.close).toHaveBeenCalled();
    expect(m.heldTrack()).toBeNull();
    expect(m.useAtcRadio.getState().input).toBeNull();
  });

  test("an answer after the last hold is let go is stopped, not kept", async () => {
    stubBrowser();
    fake.hold = true;
    const m = await load();
    const release = m.hold();
    const opened = m.find();
    release();
    await answerPrompt();
    await opened;
    expect(fake.tracks[0]!.stop).toHaveBeenCalled();
    expect(m.heldTrack()).toBeNull();
  });
});

describe("the level", () => {
  test("silence is 0, a full-scale sine about 1, and louder is held to 1", async () => {
    const { levelOf } = await load();
    expect(levelOf(new Float32Array(256))).toBe(0);
    const sine = Float32Array.from({ length: 256 }, (_, i) => Math.sin((2 * Math.PI * i) / 32));
    expect(levelOf(sine)).toBeCloseTo(0.95, 2);
    expect(levelOf(sine.map((s) => s * 4))).toBe(1);
    // A tenth of full scale, -23 dBFS: well down the bars.
    expect(levelOf(sine.map((s) => s / 10))).toBeCloseTo(0.62, 2);
  });

  test("measured ten times a second while held, and null once let go", async () => {
    stubBrowser();
    const m = await load();
    const levels: (number | null)[] = [];
    m.inputLevel.listen((level) => levels.push(level));
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const release = m.hold();
    await m.find();
    await settle();
    // A switch meters the new input in the old one's place, once.
    await m.pick("gma");
    vi.advanceTimersByTime(300);
    expect(levels.filter((l) => l !== null)).toHaveLength(3);
    expect(levels.at(-1)).toBeCloseTo(0.95, 2);
    release();
    expect(levels.at(-1)).toBeNull();
  });
});

describe("where nothing can be picked", () => {
  test("Chrome for Android: every call does nothing", async () => {
    const devices = stubBrowser({ userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/142.0 Mobile" });
    const m = await load();
    expect(m.canPickInput()).toBe(false);
    m.usePreferences.setState({ listenInput: PANEL });
    const listening = m.holdForListening();
    await m.find();
    expect(devices.getUserMedia).not.toHaveBeenCalled();
    expect(listening.track()).toBeNull();
    listening.release();
  });
});
