import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DATA_SOURCES, LICENCES_HREF, SOFTWARE, trafficCredit } from "./dataSources";

describe("the map's traffic credit", () => {
  it("names each source the planner says the airplanes came from", () => {
    expect(trafficCredit(undefined)).toBe("Traffic adsb.lol, ODbL");
    expect(trafficCredit("adsb.lol")).toBe("Traffic adsb.lol, ODbL");
    expect(trafficCredit("ADS-B Exchange")).toBe("Traffic ADS-B Exchange");
    expect(trafficCredit("adsb.lol and ADS-B Exchange")).toBe("Traffic adsb.lol, ODbL · ADS-B Exchange");
    expect(trafficCredit("somewhere else")).toBe("Traffic adsb.lol, ODbL");
  });
});

describe("About's credits", () => {
  // docs/legal/credits.md's tables: each row's first two cells, the
  // header rows left out.
  const rows = readFileSync(new URL("../../../../docs/legal/credits.md", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Credit |"))
    .map((line) => line.split("|").map((cell) => cell.trim()));

  it("are credits.md's, in its words and terms", () => {
    // The web's OurAirports line leaves off what NASR gives, in brackets.
    for (const credit of [...DATA_SOURCES, ...SOFTWARE]) {
      expect(
        rows.some((cells) => cells[1]?.startsWith(credit.name) && cells[2] === credit.licence),
        `${credit.name} is not in credits.md with ${credit.licence}`,
      ).toBe(true);
    }
    // Every row but Apple MapKit, which is the iPhone's map.
    expect(DATA_SOURCES.length + SOFTWARE.length).toBe(rows.length - 1);
  });

  it("credit the terrain's sources and OpenStreetMap's, which their licences ask", () => {
    const names = DATA_SOURCES.map((s) => s.name);
    expect(names.some((n) => n.startsWith("Terrain Tiles (Mapzen and others)"))).toBe(true);
    expect(DATA_SOURCES.filter((s) => s.name.includes("OpenStreetMap contributors")).map((s) => s.licence)).toEqual([
      "ODbL 1.0",
      "ODbL 1.0",
    ]);
    expect(DATA_SOURCES.find((s) => s.name.startsWith("Overture Maps places"))?.licence).toBe("CDLA Permissive 2.0 and Apache 2.0");
  });

  it("open the build's own open-source notices", () => {
    expect(LICENCES_HREF).toBe("/app/licences.txt");
  });
});
