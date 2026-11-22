import { afterEach, describe, expect, test } from "vitest";
import fixture from "../../lib/fixtures/routeFile.json";
import { callEngine } from "../../lib/engine/engine";
import { openRouteFile } from "./routeFile";
import { closeSharedLink, useSharedLink } from "./store";

describe("a route file", () => {
  afterEach(closeSharedLink);

  // The shared fixture, as the engine's facade test reads it too: the web
  // reads the engine's answer, never the file itself.
  test.each(fixture.cases)("$name", ({ text, answer }) => {
    expect(callEngine("route_file_read", { text })).toEqual(answer);
  });

  test("opened, it waits for its preview with the engine's reading, the pilot's plan untouched", async () => {
    const [fpl] = fixture.cases;
    await openRouteFile(new File([fpl!.text], "KMSN-KOSH.fpl"));
    const link = useSharedLink.getState().link;
    expect(link).toMatchObject({ kind: "file", fileName: "KMSN-KOSH.fpl", read: { name: "KMSN TO KOSH" } });
  });

  test("a file that is not one is put up too, its words said in the preview", async () => {
    await openRouteFile(new File(["hello"], "notes.gpx"));
    expect(useSharedLink.getState().link).toMatchObject({ kind: "file", read: { error: expect.stringContaining("not a flight plan") } });
  });
});
