"""Every image that imports wingtip is built FROM wingtip's one base image
(services/Dockerfile.base), and every way of building it can find that base.

wingtip imports wingtip_native at module level since the shared engine
(2026-11-03), so each image that copies wingtip needs the wheel; in CI's
build of 2026-11-05 every image but the planner's failed on "No module
named 'wingtip_native'". Each image then carried a byte-identical copy of
the stage that builds it, which this test held the same. Since
2026-11-06 the stage, wingtip's requirements and the wheel live in
services/Dockerfile.base alone, built once and stored once; each image says
`FROM wingtip-base`, a build context that compose (`service:base`), the
two bake files (`target:base`) and the ECR push name. An image that went
back to its own Python, or a build that forgot the context, would build
without the engine or not at all -- this test says so before a build does.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
BASE = "services/Dockerfile.base"

# Every image built on the base: those whose Dockerfile copies wingtip
# in, and the assistant, which uses the base's Python alone.
IMAGES = {
    "services/planner/Dockerfile": "planner",
    "services/ingest/Dockerfile": "ingest",
    "services/assistant/Dockerfile": "assistant",
    "services/weather/Dockerfile": "weather",
    "ml/Dockerfile.ml": "ml",
    "services/jobs/retrain/Dockerfile": "retrain",
    "services/jobs/charts/Dockerfile": "charts",
    "services/jobs/crash/Dockerfile": "crash-leads",
}


def froms(text: str) -> list[str]:
    return re.findall(r"^FROM\s+(\S+)", text, flags=re.M)


@pytest.mark.parametrize("path", IMAGES)
def test_the_image_is_built_from_the_base(path):
    # The charts job also builds tippecanoe in a build-only stage whose
    # binaries are copied on; the image itself is the last FROM.
    stages = froms((ROOT / path).read_text())
    assert stages[-1] == "wingtip-base"
    assert all(f.startswith("python:3.15-slim@sha256:") for f in stages[:-1])


@pytest.mark.parametrize("path", IMAGES)
def test_the_image_does_not_build_the_engine_again(path):
    text = (ROOT / path).read_text()
    assert "maturin" not in text and "from=native" not in text


def test_the_base_installs_the_requirements_and_the_wheel():
    text = (ROOT / BASE).read_text()
    assert len(froms(text)) == 2
    assert all(f.startswith("python:3.15-slim@sha256:") for f in froms(text))
    assert "maturin build" in text
    assert "pip install -r /tmp/wingtip-requirements.txt" in text
    assert "--mount=type=bind,from=native,source=/wheels,target=/tmp/wheels" in text
    assert "useradd -m appuser" in text


def test_every_image_reading_wingtip_is_listed():
    readers = {
        str(p.relative_to(ROOT))
        for p in [
            *ROOT.glob("services/*/Dockerfile"),
            *ROOT.glob("services/jobs/*/Dockerfile"),
            *ROOT.glob("ml/Dockerfile.*"),
            *ROOT.glob("infra/*/Dockerfile"),
        ]
        if "services/planner/wingtip" in p.read_text() or "requirements-wingtip" in p.read_text()
    }
    assert readers <= set(IMAGES), readers - set(IMAGES)


def test_compose_builds_each_image_on_the_base_service():
    text = (ROOT / "docker-compose.yml").read_text()
    assert f"dockerfile: {BASE}\n" in text
    for path in IMAGES:
        uses = re.findall(rf"dockerfile: {re.escape(path)}\n(.*?)\n(.*?)\n", text)
        assert uses, path
        for first, second in uses:
            assert (first.strip(), second.strip()) == ("additional_contexts:", "wingtip-base: service:base"), path


def test_every_pulled_image_is_pinned_by_digest():
    """C10: a tag alone is whatever was pushed under it last."""
    for path in [*IMAGES, BASE, "infra/dev-services/Dockerfile", "services/gateway/Dockerfile"]:
        text = (ROOT / path).read_text()
        for ref in froms(text) + re.findall(r"COPY --from=(\S+:\S+)", text):
            if ref != "wingtip-base" and ":" in ref:
                assert "@sha256:" in ref, (path, ref)
    for path in ["docker-compose.yml", "infra/docker-compose.prod.yml"]:
        for ref in re.findall(r"^\s+image: (\S+)", (ROOT / path).read_text(), flags=re.M):
            if not ref.startswith("${"):
                assert "@sha256:" in ref, (path, ref)


@pytest.mark.parametrize("bake", [".github/images.hcl", ".github/ci-images.hcl"])
def test_the_bake_files_build_each_image_on_the_base_target(bake):
    text = (ROOT / bake).read_text()
    targets = dict(re.findall(r'^target "([^"]+)" \{(.*?)^\}', text, flags=re.M | re.S))
    assert f'dockerfile = "{BASE}"' in targets["base"]
    for path, name in IMAGES.items():
        if name in targets:
            assert 'contexts   = { wingtip-base = "target:base" }' in targets[name], (bake, name)
