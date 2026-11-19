// @vitest-environment jsdom
/**
 * The input the radio is heard through (lib/audioInput), against stand-ins
 * for what Safari gives a page (audioInputFake). Each test has the module afresh, as a page load does.
 */
import { describe, expect, test, vi } from "vitest";
import { IPHONE, PANEL, answerPrompt, fake, load, settle, stubBrowser, installFakeBrowser } from "./audioInputFake";

installFakeBrowser();

describe("the input remembered", () => {
  test("matched by its id, then by its name", async () => {
    const { matchInput } = await load();
    const inputs = [
      { id: "a", label: "iPhone Microphone", outside: false },
      { id: "b", label: "GMA 350c", outside: true },
    ];
    expect(matchInput(inputs, { id: "b", label: "something else" })?.id).toBe("b");
    expect(matchInput(inputs, { id: "new-id", label: "GMA 350c" })?.id).toBe("b");
    expect(matchInput(inputs, { id: "x", label: "Default - GMA 350c" })?.id).toBe("b");
    expect(matchInput(inputs, { id: "x", label: "PMA450B" })).toBeNull();
  });

  test("after a reload, a listening opens the outside input remembered in the same call, unawaited", async () => {
    const devices = stubBrowser();
    fake.hold = true;
    const m = await load();
    m.usePreferences.setState({ listenInput: PANEL });
    const listening = m.holdForListening();
    // Asked for before holdForListening returned: still in the tap.
    expect(devices.getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: "gma" }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    expect(listening.track()).toBeNull();
    await answerPrompt();
    await settle();
    expect(listening.track()?.label).toBe("GMA 350c");
    listening.release();
  });

  test("the phone's own microphone remembered: listening is as it always was, nothing opened", async () => {
    const devices = stubBrowser();
    const m = await load();
    m.usePreferences.setState({ listenInput: IPHONE });
    const listening = m.holdForListening();
    expect(devices.getUserMedia).not.toHaveBeenCalled();
    listening.release();
  });

  test("its id unknown to this page load (a private window): the default opened, the inputs listed, and the one by its name chosen", async () => {
    stubBrowser();
    const m = await load();
    m.usePreferences.setState({ listenInput: { id: "old-id", label: "GMA 350c" } });
    const listening = m.holdForListening();
    for (let i = 0; i < 5; i++) await settle();
    expect(listening.track()?.label).toBe("GMA 350c");
    listening.release();
  });

  test("a localStorage that throws: the pick still opens the input", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    stubBrowser();
    const m = await load();
    const release = m.hold();
    await m.find();
    await settle();
    await expect(m.pick("gma")).resolves.toBeUndefined();
    expect(m.heldTrack()?.label).toBe("GMA 350c");
    release();
  });
});
