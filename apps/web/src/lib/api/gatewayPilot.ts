import { gateway, data, csrfHeaders } from "./http";
import { ApiError, failIfNotOk } from "./errors";
import type {
  AppleSignedIn,
  DeviceCode,
  FlightPlanFiled,
  FlightPlanFilingRequest,
  FlightServiceStatus,
  Pilot,
  PilotContactRequest,
  SignInCapabilities,
  SpeedDay,
  Subscription,
} from "./types";

/** The gateway's calls for who the pilot is (./client's `api`): signing in and
 *  out, the account, the subscription, Flight Service and the speed page. */
export const gatewayPilot = {
  /**
   * The signed-in pilot, or null when signed out -- a Spring Boot
   * endpoint, not proxied through the planner. Signed out it answers 204,
   * nothing (PilotController); a 401, from a server before that, is the
   * same answer, so this resolves to null instead of throwing.
   */
  async me(): Promise<Pilot | null> {
    try {
      return (await gateway.GET("/api/me").then(data<Pilot>)) ?? null;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },

  /** A code for this TV to be signed in with from a phone
   *  (DeviceSignInController): shown, with the address to type it at. */
  deviceCode: () => gateway.POST("/api/auth/device").then(data<DeviceCode>),

  /** Whether this TV's code has been typed in on a phone: not yet
   *  ("waiting"), signed in now with where to go, or run out ("gone"),
   *  for which the TV asks for a new one. */
  deviceToken: async (deviceCode: string): Promise<AppleSignedIn | "waiting" | "gone"> => {
    try {
      const { data: answer, response } = await gateway.POST("/api/auth/device/token", { body: { deviceCode } });
      return response.status === 202 ? "waiting" : (answer as AppleSignedIn);
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) return "gone";
      throw err;
    }
  },

  /** The code a TV shows, typed in by the pilot signed in here: the TV
   *  is signed in as them at its next ask. */
  approveDevice: async (userCode: string): Promise<void> => {
    await gateway.POST("/api/auth/device/approve", { body: { userCode } });
  },

  /** The signed-in pilot's telephone number and home base, both at once,
   *  for a flight plan's item 19 (PilotController); blank is none. */
  setContact: (body: PilotContactRequest) => gateway.PUT("/api/me/contact", { body }).then(data<Pilot>),

  /** Deletes the signed-in pilot's account and everything that was
   *  theirs, on every device, and signs them out (a 204). A 502 deleted
   *  nothing: the planner could not take their notes. */
  async deleteAccount(): Promise<void> {
    await gateway.DELETE("/api/me");
  },

  /**
   * What signing in can do here. Public, and asked before any session
   * exists: a deployment with no Google or Apple credentials and no
   * mail host cannot hold a role at all, which is what decides whether
   * the developer's switch is offered to a caller with no session.
   */
  capabilities: () => gateway.GET("/api/auth/capabilities").then(data<SignInCapabilities>),

  /** POSTs to Spring Security's own logout endpoint, which no schema
   *  describes: a 204 once the session is gone (SecurityConfig). The
   *  caller re-checks `me()` afterwards. */
  async logout(): Promise<void> {
    const res = await fetch("/logout", { method: "POST", headers: csrfHeaders("POST") });
    await failIfNotOk(res);
  },

  /**
   * Starts a magic-link sign-in -- always resolves (202) regardless of
   * whether the address has ever signed in before, the server's own
   * enumeration-safe answer. Throws only on a genuine failure (a
   * malformed address the server's own validation rejects with 400).
   */
  requestMagicLink: async (email: string): Promise<void> => {
    await gateway.POST("/api/auth/magic-link", { body: { email } });
  },

  /**
   * The last step of an emailed-link sign-in: the one POST that spends
   * the token (MagicLinkController#verify), made from the planner's own
   * dialog. Answers where the server sent the browser -- the planner,
   * or the dev page for a developer -- for the caller to open, now with
   * the new session's cookie. A link already used or past its 15
   * minutes throws an ApiError with status 400.
   */
  finishMagicLink: async (token: string): Promise<string> => {
    const res = await fetch("/api/auth/magic-link/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...csrfHeaders("POST") },
      body: new URLSearchParams({ token }),
    });
    await failIfNotOk(res);
    if (!res.redirected) return "/app/plan";
    const landing = new URL(res.url);
    return landing.pathname + landing.search;
  },
  /** The signed-in pilot's subscription to the paid features, and the
   *  free month started: once an account, a 409 after. */
  subscription: {
    get: () => gateway.GET("/api/subscription").then(data<Subscription>),
    startTrial: () => gateway.POST("/api/subscription/trial").then(data<Subscription>),
  },

  /** Flight Service's filing through the app (FlightServiceController):
   *  whether it is connected, and a flight plan filed in the pilot's name. */
  flightService: {
    status: () => gateway.GET("/api/flight-service").then(data<FlightServiceStatus>),
    file: (plan: FlightPlanFilingRequest) => gateway.POST("/api/flight-service/flight-plans", { body: plan }).then(data<FlightPlanFiled>),
  },

  /** The web app's speed, a day at a time (SpeedController): the
   *  developer's Speed page. */
  speedTrend: (days = 90) => gateway.GET("/api/speed", { params: { query: { days } } }).then(data<SpeedDay[]>),
};
