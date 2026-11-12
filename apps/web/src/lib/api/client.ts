import { plannerRoute } from "./plannerRoute";
import { plannerAirports } from "./plannerAirports";
import { plannerMap } from "./plannerMap";
import { plannerDev } from "./plannerDev";
import { assistantCalls } from "./assistantCalls";
import { gatewayPilot } from "./gatewayPilot";
import { gatewayRecords } from "./gatewayRecords";

export { ApiError, describeError, detailOf, errorMessage, failIfNotOk, isDropped, isUnknownPlace, unknownPlaceOf } from "./errors";
export { assistant, csrfHeaders, data, gateway, GatewayRequest, ndjson, planner, STREAM_QUIET_MS } from "./http";

/**
 * Every call the pages make. Both servers' calls go through
 * openapi-fetch, typed end to end from each one's own OpenAPI document
 * (`npm run types` regenerates ./schema.d.ts for the planner and
 * ./gateway-schema.d.ts for this app's Spring Boot endpoints): a renamed
 * query parameter or response field is a compile error at the call
 * site, not a silent 404 or `undefined` -- every response type named
 * below is a generated one, and `data` checks it against the path's own.
 * The one call no schema describes (Spring Security's own logout) is a
 * plain fetch that keeps the same two rules.
 *
 * One object for the pages, made of a module per area: the planner's
 * route and plan (./plannerRoute), airports and places (./plannerAirports),
 * the map's layers (./plannerMap) and the developer's (./plannerDev); the
 * assistant's Claude calls (./assistantCalls); and the gateway's, by its
 * OpenAPI tags, who the pilot is (./gatewayPilot) and what they keep
 * (./gatewayRecords). The clients and the rules every call keeps are in
 * ./http, and why a call failed in ./errors.
 */
export const api = {
  ...plannerRoute,
  ...plannerAirports,
  ...plannerMap,
  ...plannerDev,
  ...assistantCalls,
  ...gatewayPilot,
  ...gatewayRecords,
};
