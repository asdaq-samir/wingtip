"""The generated planner client (app.generated.planner_client) where a
mismatch with the planner would otherwise pass quietly: the negative
cases the hand-kept call table used to hold. An answer not of the
planner's documented shape is a PlannerError, never a half-read dict; a
field the toolbox reads is a field of the planner's model it reads it
from; a parameter the planner does not take is refused at the call; and
the transport says the planner's refusal in its own words."""

import pytest
import requests

from app import toolbox
from app.generated import planner_client as planner
from app.generated import planner_models as m
from app.generated.planner_client import PlannerError
from app.tool_answers import pick

#: The real transport, before conftest stands the planner in for it.
REAL_SEND = planner._send


def test_an_answer_not_of_the_planners_shape_is_a_planner_error(fake_planner):
    # VerdictLine.finding is the planner's enum: "go" is not one of it.
    fake_planner.answer("/api/go-no-go", {"line": {"finding": "go", "words": "Go"}, "items": []})
    with pytest.raises(PlannerError) as err:
        planner.go_no_go(body={"dep": "C81", "dest": "KDLH"})
    assert err.value.status == 502 and "documented shape" in err.value.detail


@pytest.mark.parametrize(
    "fields, model",
    [
        (toolbox.LEG_FIELDS, m.Leg),
        (toolbox.TFR_FIELDS, m.RouteTfr),
        (toolbox.HAZARD_FIELDS, m.Hazard),
        (toolbox.ITEM_FIELDS, m.VerdictItem),
        (toolbox.RISK_FIELDS, m.RiskAssessment),
        (toolbox.AIRPORT_FIELDS, m.AirportPlace),
    ],
)
def test_every_field_the_toolbox_reads_is_one_the_planner_answers(fields, model):
    assert set(fields) <= set(model.model_fields), sorted(set(fields) - set(model.model_fields))


def test_a_field_renamed_in_the_planner_is_an_error_not_a_none():
    leg = m.Leg.model_validate({"from": "C81", "ete_min": 12.0})
    assert pick(leg, "from_", "ete_min") == {"from": "C81", "ete_min": 12.0}
    with pytest.raises(AttributeError):
        pick(leg, "ete_minutes")


def test_a_parameter_the_planner_does_not_take_is_refused_at_the_call(fake_planner):
    with pytest.raises(TypeError):
        planner.plan(departure="C81", dest="KDLH")  # type: ignore[call-arg]
    assert fake_planner.calls == []


class _Response:
    def __init__(self, status, body):
        self.status_code, self._body = status, body

    def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


def test_the_planners_refusal_comes_back_in_its_own_words(monkeypatch):
    asked = {}

    def request(method, url, params=None, json=None, headers=None, timeout=None):
        asked.update(method=method, url=url, params=params, headers=headers)
        return _Response(404, {"detail": "No US airport goes by 'ZZZZ'."})

    monkeypatch.setattr(planner, "_send", REAL_SEND)
    monkeypatch.setattr(planner.requests, "request", request)
    with pytest.raises(PlannerError) as err:
        planner.briefing(dep="ZZZZ", dest="KDLH", stops="", depart=None)
    assert (err.value.status, err.value.detail) == (404, "No US airport goes by 'ZZZZ'.")
    # What is not given is left out of the query, as the planner reads an absent field.
    assert asked["params"] == {"dep": "ZZZZ", "dest": "KDLH"} and asked["url"].endswith("/api/briefing")
    # A path parameter is one segment: a slash cannot reach another path.
    with pytest.raises(PlannerError):
        planner.airport_place(ident="../api/plan")
    assert asked["url"].endswith("/api/airport/..%2Fapi%2Fplan")

    monkeypatch.setattr(
        planner.requests, "request", lambda *a, **k: _Response(422, {"detail": [{"loc": ["query", "dep"], "msg": "Field required"}]})
    )
    with pytest.raises(PlannerError, match="dep: Field required"):
        planner.plan(dep="", dest="KDLH")

    def down(*args, **kwargs):
        raise requests.ConnectionError("refused")

    monkeypatch.setattr(planner.requests, "request", down)
    with pytest.raises(PlannerError) as err:
        planner.go_no_go(body={})
    assert err.value.status == 502
