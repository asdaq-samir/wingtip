"""Plays a flight file and a shot list in X-Plane 12 through XPPython3's
`xp` (xppython3.readthedocs.io): the airplane from X-Plane's own FDR replay
or placed by this plugin, the cameras, the built-in recorder, and a log.

The X-Plane names used here are Laminar's (Resources/plugins/Commands.txt
and DataRefs.txt in X-Plane 12): the recorder is the command
sim/operation/video_record_toggle (File, Toggle video recording), and the
airplane is placed by setting sim/operation/override/override_planepath,
then its local position, psi, theta, phi and q every frame (Laminar's
"Moving the plane"). The trial (docs/XPLANE-TRIAL.md) confirms each.
"""

from __future__ import annotations

import datetime as dt
import statistics

from XPPython3 import xp

from . import camera, shots
from .track import Flight, Pose, wrap180

_FT_TO_M = 0.3048  # the international foot
_POS = "sim/flightmodel/position/"


class Log:
    """The run's lines, to a file beside the flight (Output/wingtip) and to
    XPPython3's own log."""

    def __init__(self, path: str) -> None:
        self.path = path
        self.started = dt.datetime.now()
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"\n== Wingtip replay, {self.started:%Y-%m-%d %H:%M:%S}\n")

    def __call__(self, text: str) -> None:
        line = f"{(dt.datetime.now() - self.started).total_seconds():8.2f}s  {text}"
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        xp.log(f"wingtip_replay: {text}")


class Refs:
    """Datarefs and commands, found once."""

    def __init__(self) -> None:
        def ref(name: str):
            return xp.findDataRef(name)

        self.x, self.y, self.z = (ref(_POS + f"local_{a}") for a in "xyz")
        self.vx, self.vy, self.vz = (ref(_POS + f"local_v{a}") for a in "xyz")
        self.psi, self.theta, self.phi, self.q = (ref(_POS + n) for n in ("psi", "theta", "phi", "q"))
        self.true_psi, self.mag_psi = ref(_POS + "true_psi"), ref(_POS + "mag_psi")
        self.variation = ref(_POS + "magnetic_variation")
        self.planepath = ref("sim/operation/override/override_planepath")
        self.in_replay = ref("sim/time/is_in_replay")
        self.zulu = ref("sim/time/zulu_time_sec")
        self.date_days = ref("sim/time/local_date_days")
        self.system_time = ref("sim/time/use_system_time")
        self.gear_ratio = ref("sim/flightmodel2/gear/deploy_ratio")
        self.record = xp.findCommand("sim/operation/video_record_toggle")
        self.cockpit = xp.findCommand("sim/view/3d_cockpit_cmnd_look")
        self.outside = xp.findCommand("sim/view/free_camera")
        self.quit = xp.findCommand("sim/operation/quit")
        self.rep_begin = xp.findCommand("sim/replay/rep_begin")
        self.rep_play = xp.findCommand("sim/replay/rep_play_rf")


class Player:
    """One run of a shot list over a flight. `mode` is "drive" (the plugin
    places the airplane) or "replay" (X-Plane plays the .fdr and the plugin
    follows its clock)."""

    def __init__(self, flight: Flight, settings: shots.Settings, shot_list: list[shots.Shot], mode: str, log: Log) -> None:
        self.flight, self.settings, self.mode, self.log = flight, settings, mode, log
        self.takes = shots.takes(shot_list, flight.run_times())
        self.refs = Refs()
        self.clock = shots.Clock(settings.clock, settings.fps, self.takes[0].start if self.takes else 0.0)
        self.take: shots.Take | None = None
        self.recording = False
        self.camera_on = False
        self.body: camera.Body | None = None
        self.pose: Pose | None = None
        self.grid = 0.0  # true heading less the local grid's (psi), from X-Plane
        self.cam_heading: float | None = None
        self.anchor: tuple[float, float, float] | None = None
        self.frame_dts: list[float] = []
        self.true_diffs: list[float] = []
        self.mag_diffs: list[float] = []
        self.next_check = 0.0
        self.done = False
        # The file's DREF columns: each dataref, and whether it is an int
        # (the switches) or a float (the flap handle, the ground speed).
        found = [xp.findDataRef(name) for name in flight.drefs]
        self.dref_refs = [(ref, bool(ref is not None and xp.getDataRefTypes(ref) & xp.Type_Int)) for ref in found]
        missing = [name for name, ref in zip(flight.drefs, found) if ref is None]
        if missing:
            log(f"datarefs X-Plane does not have, left alone: {missing}")
        spans = shots.recording_spans(self.takes)
        log(f"{len(flight.frames)} rows, {len(flight.runs)} run(s), {flight.duration_s:.1f} s; {len(self.takes)} take(s)")
        log(f"recording spans (s from the first row): {[(round(a, 1), round(b, 1)) for a, b in spans]}")
        log(f"mode {mode}, clock {settings.clock} at {settings.fps:g} fps, record {settings.record}")

    # The start and the end.

    def start(self) -> None:
        if not self.takes:
            self.log("no take falls inside the flight: nothing to play")
            self.done = True
            return
        if self.mode == "drive":
            xp.setDatavi(self.refs.planepath, [1], 0, 1)
            xp.setDatai(self.refs.system_time, 0)
            day = _day_of_year(self.flight.date)
            if day is not None:
                xp.setDatai(self.refs.date_days, day)
            xp.setDataf(self.refs.zulu, (self.flight.start_clock_s + self.clock.t) % 86400.0)
        else:
            xp.commandOnce(self.refs.rep_begin)
            xp.commandOnce(self.refs.rep_play)

    def stop(self, why: str) -> None:
        if self.done:
            return
        self.done = True
        self._record(False)
        self._release_camera()
        if self.mode == "drive":
            xp.setDatavi(self.refs.planepath, [0], 0, 1)
        self._summary(why)
        if self.settings.quit_when_done and why == "finished":
            xp.commandOnce(self.refs.quit)

    # Every frame.

    def frame(self, since_last: float) -> None:
        if self.done:
            return
        self.frame_dts.append(since_last)
        t = self.clock.tick(since_last) if self.mode == "drive" else self._replay_t()
        take = shots.take_at(self.takes, t)
        if take is None:
            ahead = shots.next_take(self.takes, t)
            if ahead is None:
                self.stop("finished")
                return
            self._record(False)
            if self.mode == "drive":
                # A gap, or time between two shots: cut to the next take.
                self.log(f"cut from {t:.1f} s to {ahead.start:.1f} s")
                self.clock.jump(ahead.start)
                t, take = ahead.start, ahead
                self.body = None  # no speed from the jump
            else:
                return
        if take is not self.take:
            self._begin(take)
        self.pose = self.flight.sample(t)
        if self.pose is None:
            return
        if self.mode == "drive":
            self._place(self.pose, since_last)
        self._read_body()
        self._check_heading(t)

    def _replay_t(self) -> float:
        """The replay's time from X-Plane's clock, which the .fdr sets."""
        return (xp.getDataf(self.refs.zulu) - self.flight.start_clock_s + 43200.0) % 86400.0 - 43200.0

    def _begin(self, take: shots.Take) -> None:
        self.take = take
        self.cam_heading, self.anchor = None, None
        self.log(f"{take.shot.kind} from {take.start:.1f} s to {take.end:.1f} s")
        if take.shot.kind == "cockpit":
            self._release_camera()
            xp.commandOnce(self.refs.cockpit)
        elif not self.camera_on:
            # An outside view first, as Laminar's camera example does, so
            # X-Plane draws the airplane and not the cockpit around the camera.
            xp.commandOnce(self.refs.outside)
            xp.controlCamera(xp.ControlCameraForever, self._camera, None)
            self.camera_on = True
        self._record(self.settings.record)

    def _place(self, pose: Pose, since_last: float) -> None:
        """The airplane where the file says, its heading the path's course
        on the local grid, and its switches as the file's DREF columns."""
        x, y, z = xp.worldToLocal(pose.lat, pose.lon, pose.alt_ft * _FT_TO_M)
        course = pose.course_true if pose.course_true is not None else (self.body.psi + self.grid if self.body else 0.0)
        psi = (course - self.grid) % 360.0
        step = 1.0 / self.settings.fps if self.settings.clock == "fixed" else since_last
        if self.body and step > 0:
            for ref, now, was in ((self.refs.vx, x, self.body.x), (self.refs.vy, y, self.body.y), (self.refs.vz, z, self.body.z)):
                xp.setDataf(ref, (now - was) / step)
        xp.setDatad(self.refs.x, x)
        xp.setDatad(self.refs.y, y)
        xp.setDatad(self.refs.z, z)
        xp.setDataf(self.refs.psi, psi)
        xp.setDataf(self.refs.theta, pose.pitch)
        xp.setDataf(self.refs.phi, pose.roll)
        xp.setDatavf(self.refs.q, list(camera.quaternion(psi, pose.pitch, pose.roll)), 0, 4)
        for (ref, is_int), value in zip(self.dref_refs, pose.extra):
            if ref is None:
                continue
            if is_int:
                xp.setDatai(ref, int(round(value)))
            else:
                xp.setDataf(ref, value)

    def _read_body(self) -> None:
        r = self.refs
        self.body = camera.Body(
            xp.getDatad(r.x), xp.getDatad(r.y), xp.getDatad(r.z), xp.getDataf(r.psi), xp.getDataf(r.theta), xp.getDataf(r.phi)
        )
        self.grid = wrap180(xp.getDataf(r.true_psi) - self.body.psi)

    def _check_heading(self, t: float) -> None:
        """Once a second: X-Plane's true and magnetic heading against the
        path's course and the file's magnetic heading, which says, in the
        replay, whether X-Plane read the file's heading as magnetic (the
        true heading matches the course) or as true (it is off by the
        variation). Gear readback, to see if it moves."""
        if t < self.next_check or self.pose is None:
            return
        self.next_check = t + 1.0
        xp_true, xp_mag = xp.getDataf(self.refs.true_psi), xp.getDataf(self.refs.mag_psi)
        if self.pose.course_true is not None:
            self.true_diffs.append(wrap180(xp_true - self.pose.course_true))
        self.mag_diffs.append(wrap180(xp_mag - self.pose.heading_mag))
        if len(self.mag_diffs) % 10 == 1:
            gear: list[float] = []
            xp.getDatavf(self.refs.gear_ratio, gear, 0, 1)
            self.log(
                f"t {t:.1f}: course {self.pose.course_true}, file mag {self.pose.heading_mag:.1f}, "
                f"X-Plane true {xp_true:.1f} mag {xp_mag:.1f} variation {xp.getDataf(self.refs.variation):.1f}, gear {gear}"
            )

    # The camera and the recorder.

    def _camera(self, position: list, losing: int, _ref) -> int:
        """XPLMControlCamera's callback: the take's camera, written into the
        list X-Plane hands in (XPPython3 reads it back from that list)."""
        if losing:
            self.camera_on = False
            return 0
        if self.body is None or self.take is None or self.take.shot.kind == "cockpit":
            return 1
        p = self.take.shot.params
        kind = self.take.shot.kind
        if kind == "chase":
            step = 1.0 / self.settings.fps
            self.cam_heading = camera.ease(self.cam_heading, self.body.psi, step, float(p.get("lag_s", 1.5)))
            cam = camera.chase(self.body, self.cam_heading, float(p.get("distance_m", 40)), float(p.get("height_m", 8)))
        else:
            if self.anchor is None:
                self.anchor = self._anchor(kind, p)
            cam = camera.fixed(self.anchor, self.body, float(p.get("frame_m", 0)))
        position.clear()
        position.extend(cam)
        return 1

    def _anchor(self, kind: str, p: dict) -> tuple[float, float, float]:
        """A flyby's point, beside where the airplane will be `lead_s` on;
        a tower's, at its latitude, longitude and height (ft MSL)."""
        if kind == "tower":
            return xp.worldToLocal(float(p["lat"]), float(p["lon"]), float(p["alt_ft"]) * _FT_TO_M)
        ahead = self.flight.sample(self.take.start + float(p.get("lead_s", 6))) or self.pose
        x, y, z = xp.worldToLocal(ahead.lat, ahead.lon, ahead.alt_ft * _FT_TO_M)
        course = ahead.course_true if ahead.course_true is not None else ahead.heading_mag
        psi = (course - self.grid) % 360.0
        return camera.flyby_point(camera.Body(x, y, z, psi, 0, 0), float(p.get("side_m", 60)), float(p.get("height_m", 5)))

    def _release_camera(self) -> None:
        if self.camera_on:
            xp.dontControlCamera()
            self.camera_on = False

    def _record(self, on: bool) -> None:
        if on != self.recording:
            xp.commandOnce(self.refs.record)
            self.recording = on
            self.log("recorder on" if on else "recorder off")

    def _summary(self, why: str) -> None:
        dts = [d for d in self.frame_dts if d > 0]
        if dts:
            mean = statistics.fmean(dts)
            slow = sum(1 for d in dts if d > 2 * mean)
            worst = 1000 * max(dts)
            self.log(f"frames {len(dts)}, mean {1000 * mean:.1f} ms ({1 / mean:.1f} fps), worst {worst:.0f} ms, {slow} over twice the mean")
        if self.true_diffs:
            self.log(f"X-Plane's true heading less the path's course: median {statistics.median(self.true_diffs):.1f} deg")
        if self.mag_diffs:
            self.log(f"X-Plane's magnetic heading less the file's: median {statistics.median(self.mag_diffs):.1f} deg")
        self.log(f"stopped: {why}")


def _day_of_year(date: str | None) -> int | None:
    """sim/time/local_date_days (days since 1 January) from the file's DATE,
    MM/DD/YYYY."""
    try:
        return dt.datetime.strptime(date or "", "%m/%d/%Y").timetuple().tm_yday - 1
    except ValueError:
        return None
