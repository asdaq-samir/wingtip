// The test flight (e2e/sim/flight.sim.ts, docs/SIM-FLIGHT.md) against the
// live stack, with a simulator flying beside it: scripts/dev/sim-flight.sh
// runs it, never CI (no runner has a simulator). Its file is named
// .sim.ts, which the suite's own config (testMatch's .spec.ts) never
// picks up. Signed in as the developer, as the suite is, on a phone's
// width; one worker, no retry: a flight is flown once.
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
import { DEVELOPER_STATE } from "./e2e/emailSignIn";

export default defineConfig({
  ...base,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  globalTimeout: undefined,
  reporter: "list",
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "sim",
      dependencies: ["setup"],
      testMatch: /sim\/.*\.sim\.ts$/,
      use: { viewport: { width: 390, height: 844 }, storageState: DEVELOPER_STATE },
    },
  ],
});
