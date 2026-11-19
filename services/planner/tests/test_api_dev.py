"""HTTP-layer tests of the Dev console's endpoints: the model comparison,
the status, the retrain run and the pipeline status, the health probe and
the failures held for it, against a real FastAPI TestClient. External
dependencies are mocked at the module-level names the routers call."""

import json

from fastapi.testclient import TestClient
from wingtip import model_registry, tfr, weather
from wingtip.weather import WeatherServiceError

from app.main import app
from app import dev_services
from app.routers import system

client = TestClient(app)


# --- /api/model-comparison ---


def test_model_comparison_is_empty_when_nothing_has_been_promoted(tmp_path, monkeypatch):
    # It was a 404, which a fresh stack's Performance tab toasted.
    monkeypatch.setattr(model_registry, "CURRENT_MODEL_DIR", tmp_path / "current")
    monkeypatch.setattr(model_registry, "MODELS_DIR", tmp_path)

    resp = client.get("/api/model-comparison")

    assert resp.status_code == 200
    assert resp.json() == {"models": [], "trained_at": None, "n_labeled": None}


def test_model_comparison_lists_the_sklearn_models_retrain_compared(tmp_path, monkeypatch):
    current_dir = tmp_path / "current"
    current_dir.mkdir()
    (current_dir / "metrics.json").write_text(
        json.dumps(
            {
                "model_type": "random_forest",
                "trained_at": "2026-09-10T00:00:00Z",
                "n_labeled": 206,
                "cv_mae_by_model": {"random_forest": 0.41, "ridge": 0.52},
            }
        )
    )
    monkeypatch.setattr(model_registry, "CURRENT_MODEL_DIR", current_dir)
    monkeypatch.setattr(model_registry, "MODELS_DIR", tmp_path)

    resp = client.get("/api/model-comparison")

    assert resp.status_code == 200
    body = resp.json()
    assert body["n_labeled"] == 206
    names = {m["name"]: m for m in body["models"]}
    assert names["random_forest"]["promoted"] is True
    assert names["ridge"]["promoted"] is False
    assert names["ridge"]["score"] == 0.52
    assert set(names) == {"random_forest", "ridge"}


# --- /api/status, /api/retrain, /api/aircraft-profiles ---


def test_status_reports_every_service_and_the_data_on_disk(monkeypatch):
    monkeypatch.setattr(dev_services, "SIDECAR_URL", None)
    monkeypatch.setattr(
        system,
        "_gateway_status",
        lambda: (system.ServiceStatus(up=True, detail="HTTP 200"), system.ServiceStatus(up=False, detail="HTTP 503")),
    )
    # Not the chart model's real count: that reads the real ratings'
    # corridors, a chart read of its own.
    monkeypatch.setattr(system, "_training", lambda: None)
    # The feeds' own suite is tests/test_feed_health.py: no store or
    # weather service asked here.
    monkeypatch.setattr(
        system.feeds_watch,
        "snapshot",
        lambda: {
            "checked_at": None,
            "alert_after_min": 15,
            "feeds": [{"name": "STDDS", "kind": "swim", "what": "terminal radar", "state": "ok"}],
        },
    )

    resp = client.get("/api/status")

    assert resp.status_code == 200
    body = resp.json()
    assert body["services"]["gateway"] == {"up": True, "detail": "HTTP 200"}
    assert body["services"]["db"] == {"up": False, "detail": "HTTP 503"}
    assert body["pipeline"]["startable"] is False
    assert "docker compose up retrain" in body["pipeline"]["detail"]
    # Every weather source, the winds for each forecast period included.
    assert {w["name"] for w in body["weather"]} == {
        "metars",
        "tafs",
        "airsigmets",
        "pireps",
        "gairmets",
        "winds-06",
        "winds-12",
        "winds-24",
    }
    for corridor in body["corridors"]:
        assert corridor["departure_ident"].isupper() and "by_rating" in corridor["labels"]
    # Each FAA data set on disk, with whether it is in its cycle.
    for cycle in body["data_cycles"]:
        assert cycle["state"] in {"in_force", "expired", "not_yet", "unknown"} and cycle["current"]
    assert body["feeds"]["feeds"][0]["name"] == "STDDS"


class FakeSidecar:
    """The dev-services sidecar: the retrain container's state, and what
    a start does to it."""

    def __init__(self, state: str):
        self.state = state
        self.calls = []

    def __call__(self, method, path):
        self.calls.append((method, path))
        if method == "GET":
            return FakeResponse(200, [{"name": "retrain", "state": self.state}])
        started = self.state != "running"
        self.state = "running"
        return FakeResponse(200, {"name": "retrain", "state": "running", "started": started})


class FakeResponse:
    def __init__(self, status_code: int, body):
        self.status_code = status_code
        self._body = body
        self.text = str(body)

    def json(self):
        return self._body


def test_retrain_writes_the_chart_models_table_and_says_how_without_the_sidecar(monkeypatch):
    written = []
    monkeypatch.setattr(dev_services, "SIDECAR_URL", None)
    monkeypatch.setattr(system, "_training", lambda: None)
    monkeypatch.setattr(system.chart_model, "write_training_table", lambda: written.append(True))

    resp = client.post("/api/retrain")

    assert resp.status_code == 501
    assert "docker compose up retrain" in resp.json()["detail"]
    # Written first, so the command it gives trains on the ratings as they are.
    assert written == [True]


def test_retrain_starts_the_training_runs_container(monkeypatch):
    sidecar = FakeSidecar("exited")
    monkeypatch.setattr(dev_services, "ask", sidecar)
    monkeypatch.setattr(system, "_training", lambda: None)
    monkeypatch.setattr(system.chart_model, "write_training_table", lambda: None)

    resp = client.post("/api/retrain")

    assert resp.status_code == 200
    assert resp.json() == {"started": True, "state": "running"}
    assert ("POST", "/services/retrain/start") in sidecar.calls


def test_retrain_while_a_run_is_going_leaves_it_and_its_table_alone(monkeypatch):
    # One run at a time: the table a run trains on is not written under it.
    written = []
    sidecar = FakeSidecar("running")
    monkeypatch.setattr(dev_services, "ask", sidecar)
    monkeypatch.setattr(system, "_training", lambda: None)
    monkeypatch.setattr(system.chart_model, "write_training_table", lambda: written.append(True))

    resp = client.post("/api/retrain")

    assert resp.status_code == 409
    assert written == []
    assert not any(method == "POST" for method, _ in sidecar.calls)


def test_retrain_with_too_few_ratings_says_why_instead_of_starting_a_run(monkeypatch):
    # It started the run, which failed minutes later with the news in a
    # log nobody was shown.
    sidecar = FakeSidecar("exited")
    monkeypatch.setattr(dev_services, "ask", sidecar)
    monkeypatch.setattr(
        system,
        "_training",
        lambda: system.TrainingReadiness(
            usable=28, needed=30, ready=False, rated=32, off_detection=4, reading=[], message="28 of the 30 ratings training needs."
        ),
    )

    resp = client.post("/api/retrain")

    assert resp.status_code == 409
    assert resp.json()["detail"] == "28 of the 30 ratings training needs."
    assert sidecar.calls == []


def test_the_pipeline_status_is_the_runs_own_file_and_its_container(tmp_path, monkeypatch):
    run_file = tmp_path / "run.json"
    monkeypatch.setattr(model_registry, "RUN_STATUS_PATH", run_file)
    run_file.write_text(
        json.dumps(
            {
                "run_id": "20261106T120000Z",
                "state": "running",
                "stage": "chart_retrain",
                "error": None,
                "stages": [{"name": "chart_retrain", "state": "running", "detail": None}],
            }
        )
    )

    monkeypatch.setattr(dev_services, "ask", FakeSidecar("running"))
    going = system._pipeline_status()
    assert going.startable is True
    assert (going.last_run.state, going.last_run.stage) == ("running", "chart_retrain")

    # The container stopped with the file still saying running: the run
    # was cut short, which reads as a failure, not a run going for ever.
    monkeypatch.setattr(dev_services, "ask", FakeSidecar("exited"))
    stopped = system._pipeline_status()
    assert stopped.last_run.state == "failed"
    assert stopped.last_run.error == "The run stopped before it finished."

    # Just started: the container runs before the run has written itself down.
    run_file.write_text(json.dumps({"run_id": "earlier", "state": "success", "stages": []}))
    monkeypatch.setattr(dev_services, "ask", FakeSidecar("running"))
    assert system._pipeline_status().last_run.state == "running"


# --- / ---


def test_the_health_probe_says_whether_the_warm_up_is_done(monkeypatch):
    """CI waits on this before the browser suite starts: a planner that
    answers its probe while still loading airspace and obstacles had
    the first tests timing out under it."""
    from app import main

    main.WARM.clear()
    assert client.get("/").json()["warm"] is False
    main.WARM.set()
    assert client.get("/").json()["warm"] is True


def test_a_failure_is_held_for_the_dev_console_with_its_words(monkeypatch):
    from app import errors

    errors._HELD.clear()

    def down(*args, **kwargs):
        raise WeatherServiceError("aviationweather.gov metars unavailable: 503")

    monkeypatch.setattr(weather, "reporting_idents", down)
    monkeypatch.setattr(weather, "metar_for_idents", down)
    client.get("/api/airports/in-view", params={"south": 42, "west": -89, "north": 43, "east": -88})
    monkeypatch.setattr(tfr, "all_tfrs", lambda: (_ for _ in ()).throw(tfr.TfrUnavailable("down")))
    client.get("/api/tfrs")

    held = errors.recent()
    assert [(e["path"].split("?")[0], e["status"]) for e in held] == [("/api/tfrs", 502)]
    assert held[0]["detail"].startswith("Bad gateway")
