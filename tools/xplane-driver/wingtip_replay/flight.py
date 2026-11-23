"""The test flight in X-Plane 12 (docs/SIM-FLIGHT.md): the flight file's
path (route.py) flown, the airplane's state sent to the Mac's feed once a
second (state_out.py), and the scripted traffic beside it.

Two ways to fly it ("fly" in flight.json):
- path: the plugin places the airplane on the path every frame, with
  X-Plane's flight model off (sim/operation/override/override_planepath,
  Laminar's "Moving the plane"), as the replay's drive mode does: the
  same flight every time;
- autopilot: the same from the runway to the autopilot's "from" point,
  then X-Plane's own flight model and autopilot, the plugin turning the
  heading bug to a point ahead on the path and setting the altitude and
  vertical speed dials to the path's (sim/cockpit2/autopilot/...), until
  the "to" point, where it takes the airplane back onto the path for the
  landing, easing it over in a few seconds.

On the ground the airplane is put on X-Plane's own runway (a terrain
probe) at the height its wheels were at the start, not at the FAA's
elevation, which X-Plane's mesh may differ from by a few feet.
"""

from __future__ import annotations

import math
import time

from XPPython3 import xp

from . import camera, route
from .state_out import StateOut
from .track import wrap180

_POS = "sim/flightmodel/position/"
_AP = "sim/cockpit2/autopilot/"
#: The most the placed airplane's nose turns a second, degrees: the test's
#: own easing at a point, not a figure the app states.
TURN_DEG_S = 3.0
#: Gravity, m/s^2 (the standard acceleration, 9.80665): the bank of a
#: level turn is atan(speed x turn rate / g).
G = 9.80665
#: How far ahead on the path the autopilot's heading points, m.
CARROT_M = 1500.0
#: Seconds to ease the airplane from where the autopilot left it onto the path.
BLEND_S = 5.0


class FlightRun:
    """One flight of flight.json's path, frame by frame."""

    def __init__(self, spec: dict, log) -> None:
        self.spec, self.log = spec, log
        self.points = route.points_of(spec)
        self.lengths = [self._length(i) for i in range(len(self.points) - 1)]
        self.table = route.profile(self.points, self.lengths, spec["climb_mps"], spec["descent_mps"], spec.get("rest_s", 0.0))
        self.starts = [sum(self.lengths[:i]) for i in range(len(self.lengths))]
        feed = spec.get("feed", {})
        self.out = StateOut(feed.get("host", "127.0.0.1"), feed.get("port", 49010))
        names = [p.name for p in self.points]
        ap = spec.get("autopilot") or None
        self.ap = (names.index(ap["from"]), names.index(ap["to"])) if ap else None
        self.traffic = [dict(t, after_i=names.index(t["after"]), at=None) for t in spec.get("traffic", [])]
        self.targets: list[dict] = []
        self.ref = {n: xp.findDataRef(n) for n in _REFS}
        self.probe = xp.createProbe(xp.ProbeY)
        self.mode, self.t, self.ap_done, self.ap_leg = "path", 0.0, False, 0
        self.psi: float | None = None
        self.prev: tuple[float, float, float] | None = None
        self.blend: tuple[float, float, float, float] | None = None
        self.wheel_m = 0.0
        self.own = {"gs_mps": 0.0, "vs_mps": 0.0, "track_deg": None, "on_ground": True}
        self.done = False
        log(
            f"test flight {spec.get('name', '')}: {len(self.points)} points, {self.table[-1].t / 60:.1f} min, fly {spec.get('fly', 'path')}"
        )

    def _local(self, lat: float, lon: float, alt_m: float = 0.0) -> tuple[float, float, float]:
        return xp.worldToLocal(lat, lon, alt_m)

    def _length(self, leg: int) -> float:
        a, b = self.points[leg], self.points[leg + 1]
        (ax, _, az), (bx, _, bz) = self._local(a.lat, a.lon), self._local(b.lat, b.lon)
        return math.hypot(bx - ax, bz - az)

    def _course(self, leg: int, frac: float = 0.0, ahead_m: float = 1.0) -> float:
        """The path's true course from `frac` of leg `leg` to a point
        `ahead_m` on, on X-Plane's local grid (x east, z south)."""
        lat, lon = route.place(self.points, leg, frac)
        far_leg, far = leg, frac + ahead_m / max(self.lengths[leg], 1.0)
        while far > 1.0 and far_leg + 1 < len(self.lengths):
            far = (far - 1.0) * self.lengths[far_leg] / max(self.lengths[far_leg + 1], 1.0)
            far_leg += 1
        (x0, _, z0), (x1, _, z1) = self._local(lat, lon), self._local(*route.place(self.points, far_leg, min(far, 1.0)))
        return camera.look_at((x0, 0.0, z0), (x1, 0.0, z1))[0]

    # The start and the end.

    def start(self) -> None:
        self.wheel_m = max(0.0, xp.getDataf(self.ref[_POS + "y_agl"]))
        xp.setDatavi(self.ref["sim/operation/override/override_planepath"], [1], 0, 1)
        self.log(f"placing the airplane, its wheels {self.wheel_m:.2f} m under its reference point")

    def stop(self, why: str) -> None:
        if self.done:
            return
        self.done = True
        self._send(force=True)
        xp.setDatavi(self.ref["sim/operation/override/override_planepath"], [0], 0, 1)
        self.out.close()
        self.log(f"test flight stopped: {why}; {self.out.seq} state lines sent, {self.out.failed} not")

    # Every frame.

    def frame(self, dt: float) -> None:
        if self.done:
            return
        if self.mode == "path":
            self.t += dt
            sample = route.at(self.table, self.t)
            self._place(sample, dt)
            if self.ap and not self.ap_done and sample.leg >= self.ap[0]:
                self._engage(sample)
        else:
            sample = self._autopilot()
        self._move_traffic(sample, dt)
        if self.out.due(self.t):
            self._send(sample=sample)
        if sample.resting and self.t >= self.table[-1].t:
            self.stop("finished")

    def _place(self, s: route.Sample, dt: float) -> None:
        lat, lon = route.place(self.points, s.leg, s.frac)
        ground = s.resting or (self.points[s.leg].ground and self.points[s.leg + 1].ground)
        x, y, z = self._local(lat, lon, s.alt_m)
        if ground:
            info = xp.probeTerrainXYZ(self.probe, x, y, z)
            y = info.locationY + self.wheel_m
        if self.blend:
            dx, dy, dz, left = self.blend
            k = max(0.0, left - dt) / BLEND_S
            x, y, z = x + dx * k, y + dy * k, z + dz * k
            self.blend = (dx, dy, dz, left - dt) if left > dt else None
        course = self._course(s.leg, s.frac)
        # The nose follows the path's course at most TURN_DEG_S a second;
        # standing still it stays where it was.
        turn = 0.0
        if self.psi is None:
            self.psi = course
        elif s.speed_mps > 0:
            turn = max(-TURN_DEG_S * dt, min(TURN_DEG_S * dt, wrap180(course - self.psi)))
            self.psi = (self.psi + turn) % 360.0
        bank = 0.0 if ground or dt <= 0 else math.degrees(math.atan(s.speed_mps * math.radians(turn / dt) / G))
        pitch = 0.0 if ground else math.degrees(math.atan2(s.vs_mps, max(s.speed_mps, 1.0)))
        grid = wrap180(xp.getDataf(self.ref[_POS + "true_psi"]) - xp.getDataf(self.ref[_POS + "psi"]))
        psi = (self.psi - grid) % 360.0
        if self.prev and dt > 0:
            for axis, now, was in zip("xyz", (x, y, z), self.prev):
                xp.setDataf(self.ref[_POS + f"local_v{axis}"], (now - was) / dt)
        for axis, value in zip("xyz", (x, y, z)):
            xp.setDatad(self.ref[_POS + f"local_{axis}"], value)
        xp.setDataf(self.ref[_POS + "psi"], psi)
        xp.setDataf(self.ref[_POS + "theta"], pitch)
        xp.setDataf(self.ref[_POS + "phi"], bank)
        xp.setDatavf(self.ref[_POS + "q"], list(camera.quaternion(psi, pitch, bank)), 0, 4)
        self.prev = (x, y, z)
        self.own = {"gs_mps": s.speed_mps, "vs_mps": s.vs_mps, "track_deg": self.psi, "on_ground": ground}

    # X-Plane's autopilot.

    def _engage(self, s: route.Sample) -> None:
        self.mode = "autopilot"
        fx, fz = camera.forward(self._course(s.leg, s.frac))
        xp.setDatavi(self.ref["sim/operation/override/override_planepath"], [0], 0, 1)
        xp.setDataf(self.ref[_POS + "local_vx"], s.speed_mps * fx)
        xp.setDataf(self.ref[_POS + "local_vz"], s.speed_mps * fz)
        for command in ("sim/autopilot/servos_on", "sim/autopilot/heading", "sim/autopilot/vertical_speed"):
            xp.commandOnce(xp.findCommand(command))
        self.ap_leg = s.leg
        self.log(f"X-Plane's autopilot takes over at {self.points[s.leg].name}, {self.t:.0f} s")

    def _autopilot(self) -> route.Sample:
        x, z = xp.getDatad(self.ref[_POS + "local_x"]), xp.getDatad(self.ref[_POS + "local_z"])
        while True:
            a, b = self.points[self.ap_leg], self.points[self.ap_leg + 1]
            (ax, _, az), (bx, _, bz) = self._local(a.lat, a.lon), self._local(b.lat, b.lon)
            length2 = max((bx - ax) ** 2 + (bz - az) ** 2, 1.0)
            frac = max(0.0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / length2)
            if frac < 1.0 or self.ap_leg + 1 >= len(self.lengths):
                break
            self.ap_leg += 1
        s_m = self.starts[self.ap_leg] + min(frac, 1.0) * self.lengths[self.ap_leg]
        self.t = route.time_at(self.table, s_m)
        sample = route.at(self.table, self.t)
        if self.ap_leg >= self.ap[1]:
            return self._hand_back(sample, x, z)
        variation = wrap180(xp.getDataf(self.ref[_POS + "mag_psi"]) - xp.getDataf(self.ref[_POS + "true_psi"]))
        xp.setDataf(self.ref[_AP + "heading_dial_deg_mag_pilot"], (self._course(self.ap_leg, frac, CARROT_M) + variation) % 360.0)
        target = self.spec["points"][self.ap_leg + 1].get("alt_ft")
        if target is not None:
            xp.setDataf(self.ref[_AP + "altitude_dial_ft"], float(target))
        vvi = self.spec["climb_fpm"] if sample.vs_mps > 0.05 else -self.spec["descent_fpm"] if sample.vs_mps < -0.05 else 0.0
        xp.setDataf(self.ref[_AP + "vvi_dial_fpm"], float(vvi))
        power = self.spec.get("power", {}).get(sample.phase)
        if power is not None:
            xp.setDataf(self.ref["sim/cockpit2/engine/actuators/throttle_ratio_all"], float(power))
        vx, vz = xp.getDataf(self.ref[_POS + "local_vx"]), xp.getDataf(self.ref[_POS + "local_vz"])
        self.own = {
            "gs_mps": xp.getDataf(self.ref[_POS + "groundspeed"]),
            "vs_mps": xp.getDataf(self.ref[_POS + "local_vy"]),
            "track_deg": camera.look_at((0.0, 0.0, 0.0), (vx, 0.0, vz))[0] if math.hypot(vx, vz) > 1.0 else None,
            "on_ground": bool(xp.getDatai(self.ref["sim/flightmodel/failures/onground_any"])),
        }
        return sample

    def _hand_back(self, sample: route.Sample, x: float, z: float) -> route.Sample:
        """The path again from where the autopilot is, eased over BLEND_S."""
        lat, lon = route.place(self.points, sample.leg, sample.frac)
        px, py, pz = self._local(lat, lon, sample.alt_m)
        y = xp.getDatad(self.ref[_POS + "local_y"])
        self.blend = (x - px, y - py, z - pz, BLEND_S)
        self.mode, self.ap_done, self.prev = "path", True, (x, y, z)
        xp.commandOnce(xp.findCommand("sim/autopilot/servos_off_any"))
        xp.setDatavi(self.ref["sim/operation/override/override_planepath"], [1], 0, 1)
        self.log(f"the path again at {self.points[sample.leg].name}, {math.hypot(x - px, z - pz):.0f} m off it")
        return sample

    # The scripted traffic and the state lines.

    def _move_traffic(self, s: route.Sample, dt: float) -> None:
        for t in self.traffic:
            if t["at"] is None and s.leg >= t["after_i"]:
                t["at"] = self.t + t["delay_s"]
            if t["at"] is not None and self.t >= t["at"] and not t.get("spawned"):
                t["spawned"] = True
                self.targets.append(self._spawn(t))
        for target in self.targets:
            fx, fz = camera.forward(target["track"])
            target["x"] += target["speed"] * fx * dt
            target["z"] += target["speed"] * fz * dt
        self.targets = [g for g in self.targets if self.t < g["until"]]

    def _spawn(self, t: dict) -> dict:
        own = [xp.getDatad(self.ref[_POS + f"local_{a}"]) for a in "xyz"]
        course = self.own["track_deg"] if self.own["track_deg"] is not None else 0.0
        forward, right = camera.forward(course), camera.forward(course + 90.0)
        self.log(f"traffic {t['callsign']} appears {t['ahead_m']:.0f} m ahead, {t['right_m']:.0f} m right")
        return {
            "callsign": t["callsign"],
            "hex": t["hex"],
            "x": own[0] + t["ahead_m"] * forward[0] + t["right_m"] * right[0],
            "y": own[1] + t["above_m"],
            "z": own[2] + t["ahead_m"] * forward[1] + t["right_m"] * right[1],
            "track": (course + t["turn_deg"]) % 360.0,
            "speed": t["speed_mps"],
            "until": self.t + t["for_s"],
        }

    def _send(self, sample: route.Sample | None = None, force: bool = False) -> None:
        sample = sample or route.at(self.table, self.t)
        lat, lon = xp.getDatad(self.ref[_POS + "latitude"]), xp.getDatad(self.ref[_POS + "longitude"])
        pressure = self.ref.get("sim/flightmodel2/position/pressure_altitude")
        traffic = [self._target_line(g) for g in self.targets]
        self.out.send(
            self.t,
            {
                "utc": time.time(),
                "lat": lat,
                "lon": lon,
                "alt_m": xp.getDatad(self.ref[_POS + "elevation"]),
                "pressure_ft": xp.getDataf(pressure) if pressure is not None else None,
                **self.own,
                "phase": sample.phase,
                "point": self.points[sample.leg].name,
                "next": self.points[min(sample.leg + 1, len(self.points) - 1)].name,
                "mode": self.mode,
                "done": force and sample.resting,
                "traffic": traffic,
            },
        )

    @staticmethod
    def _target_line(g: dict) -> dict:
        """A scripted airplane as the state line carries it, where X-Plane says it is."""
        lat, lon, alt = xp.localToWorld(g["x"], g["y"], g["z"])
        where = {"hex": g["hex"], "callsign": g["callsign"], "lat": lat, "lon": lon, "alt_m": alt}
        return {**where, "gs_mps": g["speed"], "vs_mps": 0.0, "track_deg": g["track"]}


_REFS = [
    *(_POS + n for n in ("local_x", "local_y", "local_z", "local_vx", "local_vy", "local_vz", "psi", "theta", "phi", "q")),
    *(_POS + n for n in ("true_psi", "mag_psi", "latitude", "longitude", "elevation", "groundspeed", "y_agl")),
    "sim/flightmodel2/position/pressure_altitude",
    "sim/flightmodel/failures/onground_any",
    "sim/operation/override/override_planepath",
    *(_AP + n for n in ("heading_dial_deg_mag_pilot", "altitude_dial_ft", "vvi_dial_fpm")),
    "sim/cockpit2/engine/actuators/throttle_ratio_all",
]
