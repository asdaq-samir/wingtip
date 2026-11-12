import { describe, expect, it } from "vitest";
import { googleReferrer } from "./googleSession";
import { GOOGLE } from "./imagery";

describe("googleReferrer", () => {
  it("sends the site's origin to Google, which the key's restriction checks", () => {
    const url = `${GOOGLE}/v1/2dtiles/5/8/12?session=s&key=k`;
    expect(googleReferrer(url)).toEqual({ url, referrerPolicy: "strict-origin" });
  });

  it("leaves every other request as it was, sending no Referer", () => {
    expect(googleReferrer("/api/planner/api/tiles/5/8/12.png")).toBeUndefined();
    expect(googleReferrer("https://tile.googleapis.com.evil.example/x")).toBeUndefined();
    expect(googleReferrer("pmtiles://overlay")).toBeUndefined();
  });
});
