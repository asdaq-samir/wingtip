"""The plugin's tests run without X-Plane: XPPython3's `xp` is a stub that
keeps what is set and says what was asked (FakeXp), and the plain parts
need nothing of it."""

import math
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class FakeXp(types.ModuleType):
    """Enough of XPPython3's xp for the player: datarefs by name, commands
    by name, a flat world (100 km a degree) for worldToLocal."""

    Type_Int, Type_Float, Type_Double = 1, 2, 8
    ControlCameraForever = 2

    def __init__(self):
        super().__init__("xp")
        self.data: dict = {"sim/flightmodel/position/true_psi": 0.0}
        self.commands: list[str] = []
        self.camera = None
        self.lines: list[str] = []

    def findDataRef(self, name):
        return name

    def findCommand(self, name):
        return name

    def getDataRefTypes(self, ref):
        return self.Type_Int if ("switches" in ref or "gear_handle" in ref) else self.Type_Float

    def getDatad(self, ref):
        return self.data.get(ref, 0.0)

    getDataf = getDatai = getDatad

    def setDatad(self, ref, value):
        self.data[ref] = value
        if ref.endswith("/psi"):  # the stub's grid is true north
            self.data["sim/flightmodel/position/true_psi"] = value

    setDataf = setDatai = setDatad

    def setDatavi(self, ref, values, offset, count):
        self.data[ref] = list(values[:count])

    setDatavf = setDatavi

    def getDatavf(self, ref, values, offset, count):
        values.extend([0.0] * count)
        return count

    def worldToLocal(self, lat, lon, alt):
        return lon * 100000.0 * math.cos(math.radians(lat)), alt, -lat * 100000.0

    def commandOnce(self, name):
        self.commands.append(name)

    def controlCamera(self, how, callback, ref):
        self.camera = callback

    def dontControlCamera(self):
        self.camera = None

    def log(self, text):
        self.lines.append(text)


@pytest.fixture
def fake_xp(monkeypatch):
    fake = FakeXp()
    package = types.ModuleType("XPPython3")
    package.xp = fake
    monkeypatch.setitem(sys.modules, "XPPython3", package)
    monkeypatch.setitem(sys.modules, "XPPython3.xp", fake)
    monkeypatch.delitem(sys.modules, "wingtip_replay.player", raising=False)
    return fake


def fdr(rows, drefs=("sim/cockpit2/controls/gear_handle_down",), date="11/08/2026"):
    """An .fdr as the Studio's export writes it (simExport/fdr.ts), from
    (clock, lon, lat, alt, heading, pitch, roll, *drefs) rows."""
    head = ["A", "4", "", "COMM, a test flight", "ACFT, Aircraft/Laminar Research/Cessna 172 SP/Cessna_172SP.acf", "TAIL, N1152Z"]
    head += [f"DATE, {date}", "PRES, 30.12", ""] + [f"DREF, {d}\t1.0" for d in drefs] + [""]
    return "\n".join(head + [", ".join(str(v) for v in row) for row in rows]) + "\n"


def clock(s):
    s %= 86400
    return f"{int(s // 3600):02d}:{int(s % 3600 // 60):02d}:{s % 60:05.2f}"


def northbound(start_s, seconds, lat0=47.49, lon=-122.21, hz=10):
    """Rows flying north at about 100 kt (0.0000463 degrees of latitude a
    tenth of a second is 5.1 m), level at 2,000 ft, gear down."""
    n = int(seconds * hz) + 1
    return [(clock(start_s + i / hz), lon, round(lat0 + i * 0.0000463, 7), 2000.0, 345.0, 0.0, 0.0, 1) for i in range(n)]
