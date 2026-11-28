"""A past flight's points made ready to replay by the engine (replay_track,
engine/crates/route/src/motion/replay.rs), here rather than on the phone or
the page: the web's WebAssembly has no room for the rule under its budget
(scripts/ci/wasm_size.py), and every app then plays the same figures.

In time order, a hole of no report said as a gap, the height smoothed
through the 25 ft steps, the climb the rate sent or the heights' trend (a
VSI's lag, never a lead), and a held pressure altitude -- readsb repeating
a stale one while the GNSS height or the rate sent moved, N722BD's 8,750 ft
as it descended -- carried at the last good height (round 7's R7-1). Where
an airborne report has no height at all, the last good one is carried and
marked held as well, so no app draws the airplane at 0 ft; on the ground
the height stays none."""

from ..engine import ask as engine


def ready(points: list[dict]) -> list[dict]:
    """`points` (flights.PAST_KEYS each) as the replay plays them: {"t",
    "lat", "lon", "alt_ft", "gs_kt", "track_deg", "vrate_fpm" (as sent),
    "vs_fpm", "gap", "ground", "alt_held"}."""
    if len(points) < 2:
        return [{**p, "vs_fpm": p.get("vrate_fpm"), "gap": False, "ground": bool(p.get("ground")), "alt_held": False} for p in points]
    asked = [
        {
            "t": p["t"],
            "lat": p["lat"],
            "lon": p["lon"],
            # The pressure altitude, which the engine tells a held one of by
            # the GNSS height beside it; the height drawn where none was sent.
            "alt_ft": p["alt_baro_ft"] if p.get("alt_baro_ft") is not None else p.get("alt_ft"),
            "gs_kt": p.get("gs_kt"),
            "track_deg": p.get("track_deg"),
            "ground": p.get("ground"),
            "baro_rate_fpm": p.get("baro_rate_fpm"),
            "geom_rate_fpm": p.get("geom_rate_fpm"),
            "alt_geom_ft": p.get("alt_geom_ft"),
        }
        for p in points
    ]
    sent = {p["t"]: p.get("vrate_fpm") for p in points}
    out, last = [], None
    for s in engine("replay_track", points=asked)["points"]:
        alt = s["alt_ft"] if s["alt_ft"] is not None else (None if s["ground"] else last)
        last = None if s["ground"] else (s["alt_ft"] if s["alt_ft"] is not None else last)
        out.append(
            {
                "t": s["t"],
                "lat": s["lat"],
                "lon": s["lon"],
                "alt_ft": alt,
                "gs_kt": s["gs_kt"],
                "track_deg": s["track_deg"],
                "vrate_fpm": sent.get(s["t"]),
                "vs_fpm": s["vs_fpm"],
                "gap": s["gap"],
                "ground": s["ground"],
                "alt_held": s["alt_held"] or (s["alt_ft"] is None and alt is not None),
            }
        )
    return out
