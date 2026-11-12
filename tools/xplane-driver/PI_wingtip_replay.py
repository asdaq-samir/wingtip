"""Wingtip replay: an XPPython3 plugin for X-Plane 12 that replays a flight
exported from the Studio (an .fdr), runs a shot list's cameras and records
it with X-Plane's own recorder (docs/XPLANE-TRIAL.md).

scripts/dev/xplane-trial.sh copies this file and the wingtip_replay folder
into X-Plane's Resources/plugins/PythonPlugins, and the flight and
shots.json into X-Plane's Output/wingtip. The plugin adds a "Wingtip
replay" menu (Plugins) with Play and Stop, and the commands
wingtip/replay/play and wingtip/replay/stop for a key. With "autostart" in
the shot list it plays by itself a few seconds after a flight has loaded.

How the airplane is replayed ("source" in shots.json):
- auto: ask X-Plane to load the .fdr (xp.loadDataFile, whose documented
  types are a situation and a replay; whether it takes an .fdr is what the
  trial finds out), and follow X-Plane's replay if it does; otherwise drive.
- menu: the .fdr was loaded through Load Flight; follow X-Plane's replay.
- drive: the plugin places the airplane from the file's rows each frame.
"""

import json
import os
import sys

from XPPython3 import xp

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from wingtip_replay import shots  # noqa: E402
from wingtip_replay.player import Log, Player  # noqa: E402
from wingtip_replay.track import parse_fdr  # noqa: E402

#: Seconds after a flight loads before an autostart, so the scenery is in.
AUTOSTART_AFTER_S = 8.0
#: Seconds to wait for X-Plane's replay after asking it to load the .fdr.
REPLAY_WAIT_S = 3.0


class PythonInterface:
    def XPluginStart(self):
        self.folder = os.path.join(xp.getSystemPath(), "Output", "wingtip")
        self.player = None
        self.waiting = None  # (flight, settings, shots, log, until) while X-Plane loads the .fdr
        self.autostart_at = None
        self.loop = None
        self.play_cmd = xp.createCommand("wingtip/replay/play", "Wingtip replay: play the shot list")
        self.stop_cmd = xp.createCommand("wingtip/replay/stop", "Wingtip replay: stop")
        xp.registerCommandHandler(self.play_cmd, self._on_play, 1, None)
        xp.registerCommandHandler(self.stop_cmd, self._on_stop, 1, None)
        self.menu = xp.createMenu("Wingtip replay", handler=None)
        xp.appendMenuItemWithCommand(self.menu, "Play the shot list", self.play_cmd)
        xp.appendMenuItemWithCommand(self.menu, "Stop", self.stop_cmd)
        return "Wingtip replay", "app.wingtipmaps.replay", "Replays a Studio flight with scripted cameras and records it."

    def XPluginEnable(self):
        self.loop = xp.createFlightLoop(self._frame, xp.FlightLoop_Phase_AfterFlightModel, None)
        xp.scheduleFlightLoop(self.loop, -1, 1)
        return 1

    def XPluginDisable(self):
        if self.player:
            self.player.stop("plugin disabled")
        if self.loop:
            xp.destroyFlightLoop(self.loop)
            self.loop = None

    def XPluginStop(self):
        xp.unregisterCommandHandler(self.play_cmd, self._on_play, 1, None)
        xp.unregisterCommandHandler(self.stop_cmd, self._on_stop, 1, None)
        xp.destroyMenu(self.menu)

    def XPluginReceiveMessage(self, inFromWho, inMessage, inParam):
        if inMessage == xp.MSG_AIRPORT_LOADED and self._spec().get("autostart"):
            self.autostart_at = xp.getElapsedTime() + AUTOSTART_AFTER_S

    # The commands.

    def _on_play(self, _cmd, phase, _ref):
        if phase == xp.CommandBegin:
            self.play()
        return 0

    def _on_stop(self, _cmd, phase, _ref):
        if phase == xp.CommandBegin and self.player:
            self.player.stop("stopped by hand")
        return 0

    def _spec(self):
        try:
            with open(os.path.join(self.folder, "shots.json"), encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return {}

    def play(self):
        os.makedirs(self.folder, exist_ok=True)
        log = Log(os.path.join(self.folder, "replay-log.txt"))
        if self.player and not self.player.done:
            self.player.stop("played again")
        try:
            spec = self._spec()
            path = os.path.join(self.folder, str(spec.get("flight", "")))
            with open(path, encoding="utf-8") as f:
                flight = parse_fdr(f.read())
            settings, shot_list = shots.load(spec, flight.duration_s)
        except (OSError, ValueError) as err:
            log(f"cannot play: {err} (shots.json and the flight belong in {self.folder})")
            return
        log(f"flight {path}: ACFT {flight.acft}, TAIL {flight.tail}, DATE {flight.date}")
        in_replay = xp.getDatai(xp.findDataRef("sim/time/is_in_replay"))
        if settings.source == "menu" or (settings.source == "auto" and in_replay):
            if not in_replay:
                log("source is menu, but X-Plane is not replaying: load the .fdr through Load Flight first")
                return
            self._go(flight, settings, shot_list, "replay", log)
        elif settings.source == "auto":
            try:
                result = xp.loadDataFile(xp.DataFile_ReplayMovie, path)
            except Exception as err:  # XPPython3 raises what the SDK refuses
                result = f"refused ({err})"
            log(f"asked X-Plane to load the .fdr as a replay: {result}")
            self.waiting = (flight, settings, shot_list, log, xp.getElapsedTime() + REPLAY_WAIT_S)
        else:
            self._go(flight, settings, shot_list, "drive", log)

    def _go(self, flight, settings, shot_list, mode, log):
        self.player = Player(flight, settings, shot_list, mode, log)
        self.player.start()

    # Every frame.

    def _frame(self, since_last, _elapsed, _counter, _ref):
        now = xp.getElapsedTime()
        if self.autostart_at is not None and now >= self.autostart_at:
            self.autostart_at = None
            self.play()
        if self.waiting:
            flight, settings, shot_list, log, until = self.waiting
            if xp.getDatai(xp.findDataRef("sim/time/is_in_replay")):
                self.waiting = None
                self._go(flight, settings, shot_list, "replay", log)
            elif now >= until:
                self.waiting = None
                log("X-Plane did not start a replay from the .fdr: the plugin places the airplane instead")
                self._go(flight, settings, shot_list, "drive", log)
        if self.player and not self.player.done:
            self.player.frame(since_last)
        return -1
