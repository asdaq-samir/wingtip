import type { EmergencyFields } from "./api/types";

/** The planner's candidate fields as the engine's best_fields reads them:
 *  the emergency card's glide ranking and the diversion drill's both send
 *  these, so one mapping. NASR's status goes through, so the engine never
 *  ranks a closed field (decision 0043). */
export const engineFields = (data: EmergencyFields) =>
  data.fields.map((f) => ({
    ident: f.ident,
    name: f.name,
    lat: f.lat,
    lon: f.lon,
    elevation_ft: f.elevation_ft ?? null,
    runways: f.runways,
    metar: f.metar ?? null,
    towered: f.towered,
    private: f.private,
    military: f.military ?? null,
    status: f.status ?? null,
  }));
