/** usePlan.test's route, its plan's asks and a signed-in pilot. */
import type { PlanParams } from "./planQuery";

export const params: PlanParams = {
  dep: "C81",
  dest: "KDLH",
  stops: [],
  altitudeFt: "",
  altitudeChoice: "lowest",
  depart: "",
  aircraft: { profile: "c172", label: "Cessna 172" },
  load: 0,
  // The map's Checkpoints on: the plan these tests are about finds them.
  checkpoints: true,
};

export const signedIn = {
  id: 7,
  displayName: "A. Pilot",
  email: "a@example.com",
  developer: false,
  fullName: null,
  phone: null,
  homeBase: null,
  avatarUrl: null,
};
