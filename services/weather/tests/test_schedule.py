"""The schedule (app.main): every product fetched at once on a start, then
at its full pace while a pilot is planning and slowly otherwise; a failure
written beside the copy it leaves in place; and the health check's word on
how fresh each product is."""

import time

import pytest
from wingtip import weather, weather_store

from app import main, radar
from app.settings import get_settings


def _products(calls: list, fail: set = frozenset()):
    def run(name):
        def go():
            calls.append(name)
            if name in fail:
                raise radar.RadarUnavailable(f"{name} down")
            weather_store.write(name, {}, fetched_at=time.time(), until=None)

        return go

    return (main.Product("metars", run("metars"), "reports"), main.Product("radar", run("radar"), "radar"))


def test_every_product_is_due_on_a_start_and_each_at_its_own_pace_after(monkeypatch):
    schedule = main.Schedule(_products([]))
    metars, radar_ = schedule.products["metars"], schedule.products["radar"]
    now = 1_000_000.0
    assert schedule.due(metars, now) and schedule.due(radar_, now)
    schedule.tried = {"metars": now, "radar": now}
    settings = get_settings()
    # Nobody planning: the slow pace, a turn of the job early or late.
    assert not schedule.due(metars, now + settings.reports_every_s)
    assert not schedule.due(radar_, now + settings.radar_idle_every_s - settings.radar_every_s)
    assert schedule.due(radar_, now + settings.radar_idle_every_s - 1)
    # A pilot planning (the planner read the store just now): every turn.
    monkeypatch.setattr(weather_store, "last_asked", lambda: now)
    assert schedule.due(metars, now + settings.reports_every_s) and schedule.due(radar_, now + settings.radar_every_s)


def test_each_product_is_a_job_at_its_planning_pace():
    on = main.schedule.scheduler()
    main.Schedule().jobs(on)
    jobs = on.get_jobs()
    assert [job.id for job in jobs] == [p.name for p in main.PRODUCTS]
    assert jobs[0].trigger.interval.total_seconds() == get_settings().reports_every_s


def test_the_pace_is_the_environments(monkeypatch):
    monkeypatch.setenv("WEATHER_REPORTS_EVERY_S", "60")
    get_settings.cache_clear()
    assert main.PRODUCTS[0].every_s(True) == 60.0
    monkeypatch.setenv("WEATHER_REPORTS_EVERY_S", "soon")
    get_settings.cache_clear()
    with pytest.raises(Exception, match="WEATHER_REPORTS_EVERY_S"):
        main.PRODUCTS[0].every_s(True)


def test_a_failure_is_written_beside_the_copy_it_leaves_and_the_planner_says_so():
    calls = []
    products = _products(calls, fail={"radar"})
    schedule = main.Schedule(products)
    for product in products:
        schedule.run(product)
    assert calls == ["metars", "radar"]
    assert weather_store.attempt("metars")["error"] is None
    assert weather_store.attempt("radar")["error"] == "radar down"
    assert set(schedule.tried) == {"metars", "radar"}


def test_the_health_check_says_how_fresh_each_product_is(monkeypatch):
    now = time.time()
    weather_store.write("metars", {}, fetched_at=now - 60, until=None)
    weather_store.write("tafs", [], fetched_at=now - 60, until=now - 1)  # past its own validity
    body = main.health(now)
    assert body["status"] == "stale" and body["in_use"] is False
    assert body["products"]["metars"]["age_s"] == 60.0 and not body["products"]["metars"]["stale"]
    assert body["products"]["tafs"]["stale"] and not body["products"]["tafs"]["servable"]
    assert body["products"]["winds-06"]["fetched_at"] is None and body["products"]["winds-06"]["stale"]
    assert set(body["products"]) == {p.name for p in main.PRODUCTS}
    # The planner reading the store makes it "in use".
    weather._dataset("metars")
    assert main.health()["in_use"] is True


def test_every_product_the_planner_reads_is_on_the_schedule():
    names = {p.name for p in main.PRODUCTS}
    assert set(weather._CACHE_SOURCES) <= names
    assert {f"winds-{hr}" for hr in weather_store.WIND_PERIODS} <= names
    assert {"glmp", "tfrs", "radar"} <= names
