"""Where each shot's camera is, in X-Plane's local coordinates, and the
airplane's orientation as X-Plane wants it written. Plain Python, for the
tests.

X-Plane's local ("OpenGL") coordinates are metres: +x east, +y up, +z south
(developer.x-plane.com/article/screencoordinates/). A camera
(XPLMControlCamera's XPLMCameraPosition_t) is x, y, z, pitch (degrees, up
positive), heading (degrees clockwise from -z, north), roll and zoom (1 is
as X-Plane draws, 2 twice as close).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .track import wrap180


@dataclass(frozen=True)
class Body:
    """The airplane in local coordinates, with its heading on the local
    grid (psi), pitch (theta) and roll (phi), degrees."""

    x: float
    y: float
    z: float
    psi: float
    theta: float
    phi: float


Camera = tuple[float, float, float, float, float, float, float]


def quaternion(psi: float, theta: float, phi: float) -> tuple[float, float, float, float]:
    """sim/flightmodel/position/q from heading, pitch and roll, as Laminar's
    "Moving the plane" article writes it (developer.x-plane.com/article/
    movingtheplane/): X-Plane draws the airplane from q, not from psi,
    theta and phi, once the flight model no longer runs."""
    p, t, r = (math.pi / 360.0 * a for a in (psi, theta, phi))
    return (
        math.cos(p) * math.cos(t) * math.cos(r) + math.sin(p) * math.sin(t) * math.sin(r),
        math.cos(p) * math.cos(t) * math.sin(r) - math.sin(p) * math.sin(t) * math.cos(r),
        math.cos(p) * math.sin(t) * math.cos(r) + math.sin(p) * math.cos(t) * math.sin(r),
        -math.cos(p) * math.sin(t) * math.sin(r) + math.sin(p) * math.cos(t) * math.cos(r),
    )


def forward(heading: float) -> tuple[float, float]:
    """The unit (x, z) of a heading on the local grid: north is -z."""
    h = math.radians(heading)
    return math.sin(h), -math.cos(h)


def look_at(cam: tuple[float, float, float], target: tuple[float, float, float]) -> tuple[float, float]:
    """The camera's heading and pitch looking from `cam` at `target`."""
    dx, dy, dz = (target[i] - cam[i] for i in range(3))
    # Shifted before the modulo: a bearing a hair west of north (-1e-15 deg,
    # from a sine's rounding) is 360.0 after `% 360`, outside [0, 360).
    heading = (math.degrees(math.atan2(dx, -dz)) + 360.0) % 360.0
    pitch = math.degrees(math.atan2(dy, math.hypot(dx, dz)))
    return heading, pitch


def ease(previous: float | None, target: float, dt: float, lag_s: float) -> float:
    """A heading that follows `target` the short way round, closing most of
    the difference in `lag_s` (a first-order lag): the chase camera swings
    round a turn after the airplane does, as a camera operator would."""
    if previous is None or lag_s <= 0:
        return target % 360.0
    k = 1.0 - math.exp(-max(dt, 0.0) / lag_s)
    return (previous + wrap180(target - previous) * k) % 360.0


def chase(body: Body, heading: float, distance_m: float, height_m: float) -> Camera:
    """Behind the airplane on `heading` (the eased one), above it, looking
    at it."""
    fx, fz = forward(heading)
    cam = (body.x - fx * distance_m, body.y + height_m, body.z - fz * distance_m)
    _, pitch = look_at(cam, (body.x, body.y, body.z))
    return (*cam, pitch, heading, 0.0, 1.0)


def flyby_point(body: Body, side_m: float, height_m: float) -> tuple[float, float, float]:
    """Where a flyby camera stands: beside where the airplane will be
    (`body`, the pose `lead_s` ahead), to its right and up (a negative
    side is to its left)."""
    fx, fz = forward(body.psi)
    rx, rz = -fz, fx  # the right of a heading on the local grid
    return body.x + rx * side_m, body.y + height_m, body.z + rz * side_m


def fixed(cam: tuple[float, float, float], body: Body, frame_m: float = 0.0, max_zoom: float = 8.0) -> Camera:
    """A camera standing at `cam` (a flyby's point, a tower) turning to keep
    the airplane in the middle; with `frame_m`, zoomed so the view is about
    that many metres across where the airplane is (X-Plane's normal view is
    about as wide as it is far), never wider than X-Plane draws."""
    heading, pitch = look_at(cam, (body.x, body.y, body.z))
    zoom = 1.0
    if frame_m > 0:
        far = math.dist(cam, (body.x, body.y, body.z))
        zoom = min(max(far / frame_m, 1.0), max_zoom)
    return (*cam, pitch, heading, 0.0, zoom)
