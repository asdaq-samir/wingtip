// @vitest-environment jsdom
/**
 * The input the radio is heard through (lib/audioInput), against stand-ins
 * for what Safari gives a page (audioInputFake). Each test has the module afresh, as a page load does.
 */
import { describe, expect, test } from "vitest";
import { IPHONE, PANEL, answerPrompt, fake, load, settle, stubBrowser, installFakeBrowser } from "./audioInputFake";

installFakeBrowser();

describe("an input lost", () => {
  async function onThePanel() {
    const devices = stubBrowser();
    const m = await load();
    const release = m.hold();
    await m.find();
    await settle();
    await m.pick("gma");
    await settle();
    return { m, devices, release, track: fake.tracks.at(-1)! };
  }

  test("its track ended: no longer heard, not called disconnected while it is still listed", async () => {
    const { m, release, track } = await onThePanel();
    track.end();
    expect(m.useAtcRadio.getState().input).toEqual({
      label: "GMA 350c",
      outside: true,
      lost: true,
      why: "ended",
      instead: null,
      paused: false,
    });
    expect(m.lostWords(m.useAtcRadio.getState().input!)).toBe("GMA 350c is no longer heard; hearing the default microphone");
    // The recognizer is handed no ended track: it hears the default.
    expect(m.heldTrack()).toBeNull();
    release();
  });

  test("no longer listed when the devices change: disconnected", async () => {
    const { m, devices, release } = await onThePanel();
    fake.present = [IPHONE];
    devices.dispatchEvent(new Event("devicechange"));
    await settle();
    const input = m.useAtcRadio.getState().input!;
    expect(input).toMatchObject({ label: "GMA 350c", lost: true, why: "disconnected" });
    expect(m.lostWords(input)).toBe("GMA 350c disconnected; hearing the default microphone");
    release();
  });

  test("the route moved to the iPhone's microphone with the panel still listed, and back again", async () => {
    const { m, release, track } = await onThePanel();
    track.reroute("iPhone Microphone", "iphone");
    const input = m.useAtcRadio.getState().input!;
    expect(input).toEqual({ label: "GMA 350c", outside: true, lost: true, why: "moved", instead: "iPhone Microphone", paused: false });
    expect(m.lostWords(input)).toBe("Not hearing GMA 350c, the iPhone microphone took over; choose it again in Listen through");
    // Not shown as chosen, so it can be chosen again.
    expect(m.useInputs.getState().chosen).toBeNull();
    track.reroute("GMA 350c", "gma");
    expect(m.useAtcRadio.getState().input).toEqual({
      label: "GMA 350c",
      outside: true,
      lost: false,
      why: null,
      instead: null,
      paused: false,
    });
    release();
  });

  test("paused by the phone, and going on", async () => {
    const { m, release, track } = await onThePanel();
    track.mute(true);
    expect(m.useAtcRadio.getState().input).toMatchObject({ label: "GMA 350c", lost: false, paused: true });
    track.mute(false);
    expect(m.useAtcRadio.getState().input).toMatchObject({ label: "GMA 350c", lost: false, paused: false });
    release();
  });

  test("its track ended and the panel back: the next listening opens it again", async () => {
    const { m, devices, release, track } = await onThePanel();
    track.end();
    const listening = m.holdForListening();
    expect(devices.getUserMedia).toHaveBeenLastCalledWith({
      audio: { deviceId: { exact: "gma" }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    await settle();
    expect(listening.track()?.label).toBe("GMA 350c");
    expect(listening.track()).not.toBe(track);
    expect(m.useAtcRadio.getState().input).toMatchObject({ label: "GMA 350c", lost: false });
    listening.release();
    release();
  });
});

describe("the list a hint", () => {
  test("a panel back while nothing held an input, not in the list kept: asked for by its id all the same, and not called lost", async () => {
    const devices = stubBrowser();
    const m = await load();
    const card = m.hold();
    await m.find();
    await settle();
    await m.pick("gma");
    await settle();
    // The master off: the panel leaves the list; then nothing holds an input.
    fake.present = [IPHONE];
    devices.dispatchEvent(new Event("devicechange"));
    await settle();
    card();
    // The master on again, unheard: nothing listened for devices.
    fake.present = [IPHONE, PANEL];
    const seen: (boolean | undefined)[] = [];
    const off = m.useAtcRadio.subscribe((s) => seen.push(s.input?.lost));
    const listening = m.holdForListening();
    expect(devices.getUserMedia).toHaveBeenLastCalledWith({
      audio: { deviceId: { exact: "gma" }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    for (let i = 0; i < 3; i++) await settle();
    expect(listening.track()?.label).toBe("GMA 350c");
    expect(m.useAtcRadio.getState().input).toMatchObject({ label: "GMA 350c", lost: false });
    expect(m.useInputs.getState().problem).toBeNull();
    // Never said lost on the way, the list read before it was named.
    expect(seen).not.toContain(true);
    off();
    listening.release();
  });

  test("the panel remembered not connected as listening begins: said as not found, with what is heard instead", async () => {
    stubBrowser();
    fake.present = [IPHONE];
    const m = await load();
    m.usePreferences.setState({ listenInput: PANEL });
    const listening = m.holdForListening();
    for (let i = 0; i < 6; i++) await settle();
    const input = m.useAtcRadio.getState().input!;
    expect(input).toEqual({ label: "GMA 350c", outside: true, lost: true, why: "missing", instead: "iPhone Microphone", paused: false });
    expect(m.lostWords(input)).toBe("GMA 350c not found; hearing the iPhone microphone");
    expect(m.useInputs.getState().problem).toBe("GMA 350c could not be found; check it is connected.");
    listening.release();
    expect(m.useAtcRadio.getState().input).toBeNull();
  });

  test("listening ended while the default was being opened in a private window: nothing more is opened", async () => {
    const devices = stubBrowser();
    const m = await load();
    m.usePreferences.setState({ listenInput: { id: "old-id", label: "GMA 350c" } });
    fake.hold = true;
    const listening = m.holdForListening();
    await settle();
    // The id refused; the default asked for, its prompt not yet answered.
    expect(devices.getUserMedia).toHaveBeenCalledTimes(2);
    listening.release();
    await answerPrompt();
    for (let i = 0; i < 5; i++) await settle();
    expect(devices.getUserMedia).toHaveBeenCalledTimes(2);
    expect(fake.tracks.every((t) => t.readyState === "ended")).toBe(true);
    // Only the one context, shut with the release.
    expect(fake.contexts).toHaveLength(1);
    expect(fake.contexts[0]!.state).toBe("closed");
  });
});
