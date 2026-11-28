"""app.route_borders: the course carries whose rules each point and leg is
under and the ADIZs met, the engine's (route_jurisdiction, route_adiz), so
the web's module no longer carries the outlines. The rules' own cases are
the engine's (engine/facade/tests/jurisdiction.rs, edge_places.rs); here,
that each answer lands on its point and the Brief's lines on the course."""

from app.route_borders import borders


def point(ident: str, lat: float, lon: float) -> dict:
    return {"ident": ident, "name": ident, "lat": lat, "lon": lon}


def test_a_field_in_canada_is_said_at_the_field_and_a_leg_across_it_on_the_leg():
    # Duluth to Thunder Bay: the field is in Canada (14 CFR 91.703(a)).
    marked, outside, adiz = borders([point("KDLH", 46.842, -92.1936), point("CYQT", 48.3719, -89.3239)])
    assert [p["outside_caution"] for p in marked] == [
        None,
        "CYQT is in Canada (Ontario): Canadian rules not checked — figures use US rules",
    ]
    assert [p["leg_caution"] for p in marked] == [None, None]
    assert outside["lead"].startswith("Part of the route is in Canada (Ontario)")
    assert adiz is None
    # Detroit City to Cleveland: both ends in the US, the leg over Ontario.
    marked, _, _ = borders([point("KDET", 42.4092, -83.0099), point("KBKL", 41.5175, -81.6833)])
    assert marked[0]["leg_caution"] == "The leg to KBKL crosses Canada (Ontario): Canadian rules not checked — figures use US rules"
    assert marked[0]["outside_caution"] is None and marked[0]["ident"] == "KDET"


def test_a_route_all_in_the_united_states_says_nothing_and_none_is_nothing():
    marked, outside, adiz = borders([point("C81", 42.3246, -88.0741), point("KDLH", 46.842, -92.1936)])
    assert outside is None and adiz is None
    assert all(p["outside_caution"] is None and p["leg_caution"] is None for p in marked)
    assert borders([]) == ([], None, None)
