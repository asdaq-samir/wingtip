"""The player against a stub of XPPython3's xp: the airplane placed with the
flight model off, the recorder toggled around each recording span and off
over a gap, the camera written into X-Plane's list, and all of it undone
at the end."""

from conftest import fdr, northbound

from wingtip_replay import shots
from wingtip_replay.track import parse_fdr

START = 15 * 3600
PLANEPATH = "sim/operation/override/override_planepath"
RECORD = "sim/operation/video_record_toggle"


def player(fake_xp, tmp_path, shot_list, fps=10):
    from wingtip_replay.player import Log, Player

    flight = parse_fdr(fdr(northbound(START, 4) + northbound(START + 10, 4, lat0=47.6)))
    settings, parsed = shots.load({"flight": "f.fdr", "fps": fps, "source": "drive", "shots": shot_list}, flight.duration_s)
    return Player(flight, settings, parsed, "drive", Log(str(tmp_path / "log.txt")))


def run(p, frames):
    for _ in range(frames):
        if p.done:
            break
        p.frame(0.5)  # a slow Mac: the fixed clock moves on 0.1 s a frame anyway


def test_the_airplane_is_placed_and_the_recorder_cut_at_the_gap(fake_xp, tmp_path):
    p = player(fake_xp, tmp_path, [{"kind": "chase", "from_s": 0, "to_s": 14}])
    p.start()
    assert fake_xp.data[PLANEPATH] == [1]
    run(p, 200)
    assert p.done
    assert fake_xp.commands.count(RECORD) == 4  # on, off at the gap, on, off at the end
    assert fake_xp.data[PLANEPATH] == [0] and fake_xp.camera is None
    assert fake_xp.data["sim/time/local_date_days"] == 311  # 8 November is the 312th day
    assert fake_xp.data["sim/cockpit2/controls/gear_handle_down"] == 1
    log = (tmp_path / "log.txt").read_text()
    assert "cut from 4.0 s to 10.0 s" in log and "stopped: finished" in log


def test_the_frames_follow_the_file_at_the_videos_rate(fake_xp, tmp_path):
    p = player(fake_xp, tmp_path, [{"kind": "chase", "from_s": 0, "to_s": 3}])
    p.start()
    run(p, 11)
    assert abs(p.pose.t - 1.1) < 1e-9
    assert fake_xp.data["sim/flightmodel/position/local_z"] < -47.49 * 100000  # north of the start
    q = fake_xp.data["sim/flightmodel/position/q"]
    assert len(q) == 4 and abs(q[0] - 1) < 1e-3  # level, heading north


def test_the_camera_is_written_into_xplanes_list(fake_xp, tmp_path):
    p = player(fake_xp, tmp_path, [{"kind": "chase", "from_s": 0, "to_s": 3, "distance_m": 50, "height_m": 10}])
    p.start()
    run(p, 3)
    position = [0.0] * 7
    keep = fake_xp.camera(position, 0, None)
    assert keep == 1 and len(position) == 7
    assert position[1] == p.body.y + 10 and position[2] > p.body.z  # above, and south of a northbound airplane
    assert fake_xp.camera([], 1, None) == 0  # X-Plane takes the camera back


def test_the_cockpit_shot_hands_the_camera_to_xplanes_cockpit_view(fake_xp, tmp_path):
    p = player(fake_xp, tmp_path, [{"kind": "chase", "from_s": 0, "to_s": 1.5}, {"kind": "cockpit", "from_s": 1.5, "to_s": 3}])
    p.start()
    run(p, 40)
    assert p.done and "sim/view/3d_cockpit_cmnd_look" in fake_xp.commands
    assert fake_xp.commands.count(RECORD) == 2  # one span through the cut
