"""router_basics.points: a place is a finite point on the globe, strict or
lenient (the round 6 audit, P2)."""

import pytest
from fastapi import HTTPException

from app.router_basics import points


def test_lenient_points_leave_out_what_is_no_place():
    assert points("42.3,-88.1;nan,nan;inf,1;91,0;x;43,-89") == [(42.3, -88.1), (43.0, -89.0)]


def test_strict_points_refuse_what_is_no_place_in_the_routes_own_words():
    with pytest.raises(HTTPException) as err:
        points("nan,1", "pairs, please", "off the globe")
    assert err.value.detail == "off the globe"
    with pytest.raises(HTTPException) as err:
        points("inf,1", "pairs, please")
    assert err.value.detail == "pairs, please"
