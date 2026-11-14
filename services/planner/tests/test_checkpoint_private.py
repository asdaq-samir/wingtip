"""A private-use field among the checkpoints is scored down unless a chart
pick on the route says the sectional draws it (app.checkpoint_scoring.
_weigh_private): the FAA's Chart User's Guide charts a private field only
where it has emergency or landmark value, so most are not on the chart."""

from app import checkpoint_scoring as scoring


def _checkpoints():
    return [
        {"category": "airport", "name": "Donald Alfred Gade (IL11)", "lat": 42.45, "lon": -88.12, "predicted_score": 4.6},
        {"category": "airport", "name": "Campbell (C81)", "lat": 42.32, "lon": -88.07, "predicted_score": 4.6},
        {"category": "water", "name": "Fox Lake", "lat": 42.40, "lon": -88.18, "predicted_score": 3.9},
    ]


def test_an_unconfirmed_private_field_falls_under_the_floor(monkeypatch):
    monkeypatch.setattr(scoring.faa_data, "private_fields", lambda cache_dir: frozenset({"IL11"}))
    monkeypatch.setattr(scoring.chartlabels, "load_picks", lambda route: [])
    scores = [c["predicted_score"] for c in scoring._weigh_private(_checkpoints(), "C81", "KUGN")]
    assert scores == [scoring.PRIVATE_UNCHARTED_SCORE, 4.6, 3.9]
    assert scoring.PRIVATE_UNCHARTED_SCORE < 2.5  # the engine's checkpoints_select floor


def test_a_private_field_a_pilot_picked_on_the_chart_keeps_its_score(monkeypatch):
    monkeypatch.setattr(scoring.faa_data, "private_fields", lambda cache_dir: frozenset({"IL11"}))
    monkeypatch.setattr(scoring.chartlabels, "load_picks", lambda route: [{"lat": 42.4501, "lon": -88.1201, "rating": 4}])
    assert scoring._weigh_private(_checkpoints(), "C81", "KUGN")[0]["predicted_score"] == 4.6
    # A 0 says "detected but I would not use it": no confirmation.
    monkeypatch.setattr(scoring.chartlabels, "load_picks", lambda route: [{"lat": 42.4501, "lon": -88.1201, "rating": 0}])
    assert scoring._weigh_private(_checkpoints(), "C81", "KUGN")[0]["predicted_score"] == scoring.PRIVATE_UNCHARTED_SCORE
