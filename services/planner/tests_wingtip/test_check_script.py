"""scripts/dev/check.sh's all-changed picks the areas CI's changes filter would.

Both read scripts/areas.yml: check.sh and the pre-push hook through
scripts/areas.py, and ci.yml's paths-filter block is generated from it, which
the last tests here hold to.

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
    result = subprocess.run(["bash", str(SCRIPT), "--areas"], input="\n".join(paths) + "\n", capture_output=True, text=True, check=True)
    return result.stdout.split()


def test_a_web_change_is_the_web_alone():
    assert areas("apps/web/src/components/Map.tsx") == ["web", "arch"]


def test_an_openapi_document_reaches_the_web_types():
    assert areas("services/planner/openapi.json") == ["web", "planner", "assistant", "java"]
    assert areas("services/gateway/openapi.json") == ["web", "java"]


def test_wingtip_reaches_every_python_that_imports_it():
    # ingest, the weather service and the jobs copy wingtip in.
    assert areas("services/planner/wingtip/airspace.py") == ["py", "planner", "ingest", "weather", "jobs", "arch"]
    assert areas("services/ingest/ingest/swim.py") == ["ingest", "arch"]


def test_the_weather_service_is_its_own_area():
    assert areas("services/weather/app/gfs.py") == ["weather", "arch"]


def test_a_job_is_its_own_area():
    assert areas("services/jobs/charts/overlays.py") == ["jobs", "arch"]


def test_an_engine_rule_reaches_every_shell_of_it():
    assert areas("engine/facade/src/call.rs") == ["py", "planner", "ingest", "weather", "jobs", "engine", "ios", "android", "arch"]


def test_the_shared_fixtures_reach_wingtips_tests_the_engine_and_the_phones():
    assert areas("apps/web/src/lib/fixtures/winds.json") == ["web", "py", "engine", "ios", "android"]


def test_each_app_is_its_own_area():
    # The pom and the Gradle build carry .tool-versions' Java and Gradle,
    # which the arch area's toolchain.sh --check holds them to.
    assert areas("services/gateway/pom.xml") == ["java", "arch"]
    assert areas("apps/ios/Wingtip/App.swift") == ["ios", "arch"]
    assert areas("apps/android/app/build.gradle.kts") == ["android", "arch"]
    assert areas("apps/site/src/index.html") == ["site"]


def test_the_sites_sources_reach_it():
    # Its colours are the tokens' and its legal pages the web app's; the
    # tokens are also what the brand guard (arch) holds every app to.
    assert areas("apps/web/public/privacy.html") == ["web", "site"]
    assert areas("design/tokens.json") == ["web", "ios", "android", "site", "arch"]


def test_words_alone_check_only_the_versions_they_name():
    # The docs' prose names the toolchain's versions, which toolchain.sh
    # --check (the arch area) holds to .tool-versions; nothing else runs.
    assert areas("README.md", "docs/CI.md", ".claude/skills/checks/SKILL.md") == ["arch"]


def test_each_area_once_in_one_order():
    assert areas("services/planner/tests_wingtip/test_geo.py", "services/planner/wingtip/geo.py", "apps/web/src/App.tsx") == [
        "web",
        "py",
        "planner",
        "ingest",
        "weather",
        "jobs",
        "arch",
    ]


def test_ci_yml_has_the_filters_the_areas_file_makes():
    result = subprocess.run(["python3", str(ROOT / "scripts" / "areas.py"), "check"], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_check_sh_lists_the_areas_the_file_names():
    names = subprocess.run(
        ["python3", str(ROOT / "scripts" / "areas.py"), "names"], capture_output=True, text=True, check=True
    ).stdout.split()
    assert names == "web py planner ingest assistant weather jobs engine java ios android site xplane arch".split()
    for name in names:
        # every area has a branch in check.sh's run_area
        assert f"\n    {name})" in SCRIPT.read_text(), name
