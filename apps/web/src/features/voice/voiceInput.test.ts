// @vitest-environment jsdom
/**
 * Ask by voice (features/voice) apart from the radio (lib/atcListening):
 * the words so far in its own store for the field, the whole once it
 * ends, nothing in the radio's store -- no pill, no log, no listening --
 * and the default microphone, not the radio's input. lib/listen is a
 * stand-in that says what the test tells it to.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Heard = (id: number, text: string, final: boolean) => void;
const sessions: { heard: Heard; ended: (error?: string) => void; track?: unknown }[] = [];

vi.mock("../../lib/listen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/listen")>()),
  listen: vi.fn(async (_w: string[], _p: unknown, heard: Heard, ended: (error?: string) => void, track?: unknown) => {
    sessions.push({ heard, ended, track });
    return { stop: () => ended(), renew: () => {} };
  }),
}));

async function load() {
  const voice = await import("./voiceInput");
  const { useVoiceInput } = await import("./voiceStore");
  const { useAtcRadio } = await import("../../lib/atcRadio");
  return { ...voice, useVoiceInput, useAtcRadio };
}

beforeEach(() => {
  vi.resetModules();
  sessions.length = 0;
});

afterEach(async () => {
  (await import("./voiceInput")).stopVoice();
});

describe("Ask by voice", () => {
  test("the words come into its own store as they are said, and the whole is what was said", async () => {
    const m = await load();
    const said = m.hearVoice("search");
    await vi.waitFor(() => expect(sessions).toHaveLength(1));
    expect(m.useVoiceInput.getState().field).toBe("search");
    sessions[0]!.heard(0, "direct to", false);
    expect(m.useVoiceInput.getState().words).toBe("direct to");
    sessions[0]!.heard(0, "direct to Duluth", true);
    expect(m.useVoiceInput.getState().words).toBe("direct to Duluth");
    m.stopVoice();
    await expect(said).resolves.toBe("direct to Duluth");
    expect(m.useVoiceInput.getState()).toMatchObject({ field: null, words: "", error: null });
  });

  test("it leaves the radio alone: no pill, no log, not listening, and no radio input handed over", async () => {
    const m = await load();
    const said = m.hearVoice("ask");
    await vi.waitFor(() => expect(sessions).toHaveLength(1));
    sessions[0]!.heard(0, "how much fuel", true);
    const radio = m.useAtcRadio.getState();
    expect(radio.listening).toBe(false);
    expect(radio.pill).toBeNull();
    expect(radio.heard).toEqual([]);
    expect(sessions[0]!.track).toBeUndefined();
    m.stopVoice();
    await said;
  });

  test("nothing said is said so, for that field alone", async () => {
    const m = await load();
    const said = m.hearVoice("ask");
    await vi.waitFor(() => expect(sessions).toHaveLength(1));
    m.stopVoice();
    await expect(said).resolves.toBe("");
    expect(m.useVoiceInput.getState().error).toEqual({ field: "ask", text: expect.stringContaining("Nothing was heard") });
  });

  test("with the radio being listened to it does not start, and says why", async () => {
    const m = await load();
    m.useAtcRadio.setState({ listening: true, mode: "radio" });
    await expect(m.hearVoice("search")).resolves.toBe("");
    expect(sessions).toHaveLength(0);
    expect(m.useVoiceInput.getState().error?.text).toContain("radio");
    m.useAtcRadio.setState({ listening: false, mode: null });
  });

  test("the radio started meanwhile ends it", async () => {
    const m = await load();
    const said = m.hearVoice("search");
    await vi.waitFor(() => expect(sessions).toHaveLength(1));
    sessions[0]!.heard(0, "nearest", true);
    m.useAtcRadio.setState({ listening: true, mode: "radio" });
    await expect(said).resolves.toBe("nearest");
    m.useAtcRadio.setState({ listening: false, mode: null });
  });
});
