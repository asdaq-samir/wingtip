import { describe, expect, it } from "vitest";
import { dial, hostOf } from "./contactLinks";

describe("contactLinks", () => {
  it("dials a US number as NASR writes it", () => {
    expect(dial("847-537-2580")).toBe("tel:+18475372580");
  });
  it("shows a site by its host, without https:// or www.", () => {
    expect(hostOf("https://www.chiexec.com/about")).toBe("chiexec.com");
    expect(hostOf("http://flyuga.org")).toBe("flyuga.org");
    expect(hostOf("www.example.net")).toBe("example.net");
  });
});
