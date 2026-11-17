/**
 * Stand-ins for what Safari gives a page, shared by the audioInput tests: see audioInput.test.ts.
 */
import { afterEach, beforeEach, expect, vi } from "vitest";

export const IPHONE = { id: "iphone", label: "iPhone Microphone" };
export const PANEL = { id: "gma", label: "GMA 350c" };

class FakeTrack extends EventTarget {
  kind = "audio";
  readyState: "live" | "ended" = "live";
  muted = false;
  constructor(
    public label: string,
    public deviceId: string,
  ) {
    super();
  }
  getSettings() {
    return { deviceId: this.deviceId };
  }
  stop = vi.fn(() => {
    this.readyState = "ended";
  });
  /** The device gone: as the browser ends a capture. */
  end() {
    this.readyState = "ended";
    this.dispatchEvent(new Event("ended"));
  }
  /** Paused by the phone (a call, Siri) and going on again. */
  mute(on: boolean) {
    this.muted = on;
    this.dispatchEvent(new Event(on ? "mute" : "unmute"));
  }
  /** iOS moved the route: Safari renames the capture and says so. */
  reroute(label: string, deviceId: string) {
    this.label = label;
    this.deviceId = deviceId;
    this.dispatchEvent(new Event("configurationchange"));
  }
}

/** What the stand-ins hold, reset before each test (installFakeBrowser). \`hold\`: each
 *  getUserMedia's answer is held until let through where a test asks. */
export const fake = {
  granted: false,
  present: [] as { id: string; label: string }[],
  tracks: [] as FakeTrack[],
  contexts: [] as FakeContext[],
  sessionLog: [] as string[],
  hold: false,
  pending: [] as (() => void)[],
};

class FakeContext {
  state = "running";
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {
    this.state = "closed";
  });
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
  createAnalyser = vi.fn(() => ({
    fftSize: 2048,
    // A full-scale sine, 32 samples a cycle.
    getFloatTimeDomainData: (samples: Float32Array) => {
      for (let i = 0; i < samples.length; i++) samples[i] = Math.sin((2 * Math.PI * i) / 32);
    },
  }));
  constructor() {
    fake.contexts.push(this);
  }
}

function mediaDevices() {
  const devices = Object.assign(new EventTarget(), {
    enumerateDevices: vi.fn(async () =>
      fake.granted
        ? fake.present.map((d) => ({ kind: "audioinput", deviceId: d.id, label: d.label, groupId: "" }))
        : [{ kind: "audioinput", deviceId: "", label: "", groupId: "" }],
    ),
    getUserMedia: vi.fn((constraints: { audio: { deviceId?: { exact: string } } }) => {
      // No device asked for: the route's own, the first.
      const id = constraints.audio.deviceId?.exact ?? fake.present[0]!.id;
      const device = fake.present.find((d) => d.id === id);
      if (!device) return Promise.reject(Object.assign(new Error("no such device"), { name: "OverconstrainedError" }));
      const answer = () => {
        fake.granted = true;
        const track = new FakeTrack(device.label, device.id);
        fake.tracks.push(track);
        return { getAudioTracks: () => [track], getTracks: () => [track] };
      };
      if (!fake.hold) return Promise.resolve(answer());
      return new Promise((resolve) => fake.pending.push(() => resolve(answer())));
    }),
  });
  return devices;
}

export function stubBrowser({
  userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) Safari/605.1.15",
  audioSession = true,
} = {}) {
  const devices = mediaDevices();
  const session = {
    set type(type: string) {
      fake.sessionLog.push(type);
    },
    get type() {
      return fake.sessionLog.at(-1) ?? "auto";
    },
  };
  vi.stubGlobal("navigator", { userAgent, mediaDevices: devices, ...(audioSession ? { audioSession: session } : {}) });
  vi.stubGlobal("AudioContext", FakeContext);
  return devices;
}

/** The module and the stores it writes, afresh. */
export async function load() {
  const audio = await import("./audioInput");
  const { useAtcRadio, inputLevel, lostWords } = await import("./atcRadio");
  const { usePreferences } = await import("./preferences");
  return { ...audio, useAtcRadio, inputLevel, lostWords, usePreferences };
}

export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The held prompt answered, once the module has asked for it: taken at
 * once, it failed now and then in a full, loaded run ("pending.shift(...)
 * is not a function") when the ask was still a few awaits away. */
export async function answerPrompt() {
  await vi.waitFor(() => expect(fake.pending.length).toBeGreaterThan(0), { timeout: 2000, interval: 5 });
  fake.pending.shift()!();
}

/** Each test has the module afresh, as a page load does: call once at the top of a test file. */
export function installFakeBrowser() {
  beforeEach(() => {
    vi.resetModules();
    fake.granted = false;
    fake.present = [IPHONE, PANEL];
    fake.tracks = [];
    fake.contexts = [];
    fake.sessionLog = [];
    fake.hold = false;
    fake.pending = [];
    try {
      localStorage.clear();
    } catch {
      /* a stub that throws */
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
}
