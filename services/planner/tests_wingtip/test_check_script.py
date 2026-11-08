"""scripts/dev/check.sh's all-changed picks the areas CI's changes filter would.

The local checks run only what a branch touched; an area missed here is a
check that passes on the Mac and fails in CI, and an area added for nothing
is minutes in a turn another session waits for.
"""
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "dev" / "check.sh"

pytestmark = pytest.mark.skipif(shutil.which("bash") is None, reason="needs bash")


def areas(*paths: str) -> list[str]:
    result = subprocess.run(
        ["bash", str(SCRIPT), "--areas"], input="\n".join(paths) + "\n",
        capture_output=True, text=True, check=True,
    )
    return result.stdout.split()


def test_a_web_change_is_the_web_alone():
    assert areas("apps/web/src/components/Map.tsx") == ["web"]


def test_an_openapi_document_reaches_the_web_types():
    assert areas("services/planner/openapi.json") == ["web", "planner"]
    assert areas("services/gateway/openapi.json") == ["web", "java"]


def test_wingtip_reaches_every_python_that_imports_it():
    # ingest, the weather service and the jobs copy wingtip in.
    assert areas("services/planner/wingtip/airspace.py") == ["py", "planner", "ingest", "weather", "jobs"]
    assert areas("services/ingest/ingest/swim.py") == ["ingest"]


def test_the_weather_service_is_its_own_area():
    assert areas("services/weather/app/gfs.py") == ["weather"]


def test_a_job_is_its_own_area():
    assert areas("services/jobs/charts/overlays.py") == ["jobs"]


def test_an_engine_rule_reaches_every_shell_of_it():
    assert areas("engine/facade/src/call.rs") == [
        "py", "planner", "ingest", "weather", "jobs", "engine", "ios", "android"]


def test_the_shared_fixtures_reach_the_engine_and_the_phones():
    assert areas("apps/web/src/lib/fixtures/winds.json") == [
        "web", "engine", "ios", "android"]


def test_each_app_is_its_own_area():
    assert areas("services/gateway/pom.xml") == ["java"]
    assert areas("apps/ios/Wingtip/App.swift") == ["ios"]
    assert areas("apps/android/app/build.gradle.kts") == ["android"]


def test_words_alone_check_nothing():
    assert areas("README.md", "docs/CI.md", ".claude/skills/checks/SKILL.md") == []


def test_each_area_once_in_one_order():
    assert areas("services/planner/tests_wingtip/test_geo.py", "services/planner/wingtip/geo.py", "apps/web/src/App.tsx") == [
        "web", "py", "planner", "ingest", "weather", "jobs"]
