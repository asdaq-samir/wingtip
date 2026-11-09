"""The radar and satellite loop's frames (wingtip.weather_loop), from the
times the weather service stored, written here."""

import time

from wingtip import weather_loop, weather_store


def _store(radar: str | None = "2026-11-09T21:20:00Z", ir: list[str] | None = None, visible: list[str] | None = None):
    now = time.time()
    if radar:
        weather_store.write("radar", {"valid": radar}, fetched_at=now, until=None)
    weather_store.write("satellite", {"ir": ir or [], "visible": visible or []}, fetched_at=now, until=None)


def test_the_radar_loop_is_the_last_hour_five_minutes_apart_oldest_first():
    _store(radar="2026-11-09T21:22:00Z")
    loop = weather_loop.frames("radar")
    times = [f["valid"] for f in loop["frames"]]
    assert len(times) == 12
    assert times[0] == "2026-11-09T20:25:00Z" and times[-1] == "2026-11-09T21:20:00Z"
    assert loop["frames"][-1]["radar_tiles"] == (
        "https://mesonet.agron.iastate.edu/c/tile.py/1.0.0/ridge::USCOMP-N0Q-202611092120/{z}/{x}/{y}.png"
    )
    assert all(f["satellite_tiles"] is None for f in loop["frames"])
    assert loop["step_s"] == 300 and loop["old_after_s"] == 900
    assert "Not for navigation" in loop["credit"]


def test_a_satellite_loop_takes_nowcoasts_pictures_ten_minutes_apart():
    ir = [f"2026-11-09T{h:02d}:{m:02d}:00Z" for h in (19, 20, 21) for m in range(3, 60, 5) if (h, m) <= (21, 18)]
    _store(ir=ir)
    loop = weather_loop.frames("ir")
    times = [f["valid"] for f in loop["frames"]]
    assert len(times) == 12
    assert times[-1] == "2026-11-09T21:18:00Z" and times[-2] == "2026-11-09T21:08:00Z"
    tiles = loop["frames"][-1]["satellite_tiles"]
    assert "layers=goes_longwave_imagery" in tiles and "time=2026-11-09T21:18:00Z" in tiles and "{bbox-epsg-3857}" in tiles
    assert loop["old_after_s"] == 1800


def test_the_visible_loop_draws_the_visible_picture():
    _store(visible=["2026-11-09T21:03:00Z", "2026-11-09T21:13:00Z"])
    tiles = [f["satellite_tiles"] for f in weather_loop.frames("visible")["frames"]]
    assert len(tiles) == 2 and all("layers=goes_visible_imagery" in t for t in tiles)


def test_both_draws_the_radar_made_by_each_pictures_time_and_says_the_older_time():
    _store(radar="2026-11-09T21:15:00Z", ir=["2026-11-09T21:08:00Z", "2026-11-09T21:18:00Z"])
    frames = weather_loop.frames("both")["frames"]
    assert [f["valid"] for f in frames] == ["2026-11-09T21:05:00Z", "2026-11-09T21:15:00Z"]
    assert "USCOMP-N0Q-202611092105" in frames[0]["radar_tiles"]
    # The newest mosaic is 21:15, older than the picture: that one is drawn.
    assert "USCOMP-N0Q-202611092115" in frames[1]["radar_tiles"]
    assert "time=2026-11-09T21:18:00Z" in frames[1]["satellite_tiles"]


def test_nothing_stored_is_no_frames():
    assert weather_loop.frames("radar")["frames"] == []
    assert weather_loop.frames("ir")["frames"] == []
