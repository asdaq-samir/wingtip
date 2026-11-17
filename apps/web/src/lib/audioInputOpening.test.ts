// @vitest-environment jsdom
/**
 * The input the radio is heard through (lib/audioInput), against stand-ins
 * for what Safari gives a page (audioInputFake). Each test has the module afresh, as a page load does.
 */
import { describe, expect, test } from "vitest";
import { IPHONE, PANEL, answerPrompt, fake, load, settle, stubBrowser, installFakeBrowser } from "./audioInputFake";

installFakeBrowser();

describe("opening an input", () => {
  test("an outside input by its exact id with the voice processing off; the phone's own by its id with it asked on; Find Inputs the default, with it on", async () => {
    const devices = stubBrowser();
    const m = await load();
    const release = m.hold();
    await m.find();
    await settle();
    // On: a capture on iOS takes the shared unit's voice processing as an
    // earlier one left it (WebKit's CoreAudioCaptureUnit).
    expect(devices.getUserMedia).toHaveBeenLastCalledWith({ audio: { echoCancellation: true } });
    await m.pick("gma");
    expect(devices.getUserMedia).toHaveBeenLastCalledWith({
      audio: { deviceId: { exact: "gma" }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    expect(m.heldTrack()?.label).toBe("GMA 350c");
    expect(m.useAtcRadio.getState().input).toEqual({
      label: "GMA 350c",
      outside: true,
      lost: false,
      why: null,
      instead: null,
      paused: false,
    });
    // The one before is stopped once the new one is live, and its end is no loss.
    expect(fake.tracks[0]!.stop).toHaveBeenCalled();
    await m.pick("iphone");
    expect(devices.getUserMedia).toHaveBeenLastCalledWith({ audio: { deviceId: { exact: "iphone" }, echoCancellation: true } });
    expect(m.useAtcRadio.getState().input).toEqual({
      label: "iPhone Microphone",
      outside: false,
      lost: false,
      why: null,
      instead: null,
      paused: false,
    });
    expect(m.usePreferences.getState().listenInput).toEqual(IPHONE);
    release();
  });

  test("Find Inputs opens the outside input remembered, not the phone's own in its place", async () => {
    const devices = stubBrowser();
    const m = await load();
    m.usePreferences.setState({ listenInput: PANEL });
    const release = m.hold();
    await m.find();
    await settle();
    expect(devices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(devices.getUserMedia).toHaveBeenLastCalledWith({
      audio: { deviceId: { exact: "gma" }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    expect(m.useInputs.getState()).toMatchObject({ found: true, chosen: "gma" });
    release();
  });

  test("nothing is opened once nothing holds the input", async () => {
    const devices = stubBrowser();
    const m = await load();
    await m.choose(PANEL);
    expect(devices.getUserMedia).not.toHaveBeenCalled();
    expect(fake.contexts).toHaveLength(0);
  });

  test("Safari's session is play-and-record only once the track is live, and playback then auto as it is let go", async () => {
    stubBrowser();
    fake.hold = true;
    const m = await load();
    const release = m.hold();
    const opened = m.find();
    // Asked for in the tap, the context made then too; the session not yet.
    expect(fake.contexts).toHaveLength(1);
    expect(fake.contexts[0]!.resume).toHaveBeenCalled();
    expect(fake.sessionLog).toEqual([]);
    await answerPrompt();
    await opened;
    expect(fake.sessionLog).toEqual(["play-and-record"]);
    release();
    expect(fake.sessionLog).toEqual(["play-and-record", "playback", "auto"]);
  });

  test("a switch puts the session back to auto before the capture, so play-and-record after it is a change WebKit takes", async () => {
    stubBrowser();
    const m = await load();
    const release = m.hold();
    await m.find();
    await settle();
    fake.hold = true;
    const picked = m.pick("gma");
    expect(fake.sessionLog).toEqual(["play-and-record", "auto"]);
    await answerPrompt();
    await picked;
    expect(fake.sessionLog).toEqual(["play-and-record", "auto", "play-and-record"]);
    release();
  });

  test("refused in another browser: its own settings for the website", async () => {
    const devices = stubBrowser({
      userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/142.0 Safari/537.36",
      audioSession: false,
    });
    devices.getUserMedia.mockImplementationOnce(() => Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" })));
    const m = await load();
    const release = m.hold();
    await m.find();
    expect(m.useInputs.getState().problem).toBe("Microphone access was refused; allow it in the browser's settings for this website.");
    release();
  });

  test("without navigator.audioSession (Chrome, Firefox) nothing throws", async () => {
    stubBrowser({ userAgent: "Mozilla/5.0 (Macintosh) Chrome/142.0", audioSession: false });
    const m = await load();
    const release = m.hold();
    await m.find();
    await m.pick("gma");
    expect(m.heldTrack()?.label).toBe("GMA 350c");
    expect(() => release()).not.toThrow();
  });

  test("a refusal is said where the input was picked", async () => {
    const devices = stubBrowser();
    devices.getUserMedia.mockImplementationOnce(() => Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" })));
    const m = await load();
    const release = m.hold();
    await m.find();
    // A website has no entry of its own in iOS's Settings.
    expect(m.useInputs.getState().problem).toBe("Microphone access was refused; allow it in Safari's settings for this website.");
    // iOS 26's lost microphone (WebKit bug 319706): relaunch Safari.
    devices.getUserMedia.mockImplementationOnce(() =>
      Promise.reject(Object.assign(new Error("No AVAudioSessionCaptureDevice"), { name: "NotAllowedError" })),
    );
    await m.find();
    expect(m.useInputs.getState().problem).toMatch(/^No microphone could be used\..*close Safari and open it again\.$/);
    release();
  });
});
