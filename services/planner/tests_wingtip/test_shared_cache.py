"""scripts/build/shared-cache.sh's engine store, and the turn one-at-a-time.sh names.

The store hands every worktree an engine build another made from the same
files, so a wrong key serves one engine's build for another's: these run
its functions for real, in a scratch repository of their own, and hold
the key to the engine's files, the copy to what was published, and the
first of two publishes of one engine to the one kept.
"""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
LIB = ROOT / "scripts" / "build" / "shared-cache.sh"
TURNS = ROOT / "scripts" / "dev" / "one-at-a-time.sh"

pytestmark = pytest.mark.skipif(
    shutil.which("bash") is None or shutil.which("git") is None or not LIB.exists(), reason="needs bash, git and the script"
)


@pytest.fixture
def repo(tmp_path):
    """A repository with the library where it lives, an engine file and .tool-versions."""
    root = tmp_path / "repo"
    (root / "scripts" / "build").mkdir(parents=True)
    shutil.copy(LIB, root / "scripts" / "build" / "shared-cache.sh")
    (root / "engine").mkdir()
    (root / "engine" / "lib.rs").write_text("pub fn one() -> u8 { 1 }\n")
    (root / ".tool-versions").write_text("rust 1.99.1\n")
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    return root


def run(repo: Path, script: str, cache: Path, **env: str) -> subprocess.CompletedProcess:
    full = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(repo), "WINGTIP_CACHE": str(cache), **env}
    return subprocess.run(["bash", "-c", f". scripts/build/shared-cache.sh\n{script}"], cwd=repo, env=full, capture_output=True, text=True)


def key(repo: Path, cache: Path) -> str:
    out = run(repo, "engine_store_key", cache)
    assert out.returncode == 0, out.stderr
    return out.stdout.strip()


def test_the_key_follows_the_engines_files_and_nothing_else(repo, tmp_path):
    cache = tmp_path / "cache"
    first = key(repo, cache)
    (repo / "apps").mkdir()
    (repo / "apps" / "page.ts").write_text("export {};\n")
    assert key(repo, cache) == first
    (repo / "engine" / "lib.rs").write_text("pub fn one() -> u8 { 2 }\n")
    assert key(repo, cache) != first


def test_a_published_build_is_restored_whole(repo, tmp_path):
    cache = tmp_path / "cache"
    built = repo / "out"
    built.mkdir()
    (built / "lib.a").write_bytes(b"\x00engine")
    assert run(repo, "engine_store_publish ios out", cache).returncode == 0
    restored = run(repo, "rm -rf out && engine_store_restore ios out", cache)
    assert restored.returncode == 0, restored.stderr
    assert (repo / "out" / "lib.a").read_bytes() == b"\x00engine"
    # Another engine finds nothing.
    (repo / "engine" / "lib.rs").write_text("pub fn one() -> u8 { 3 }\n")
    assert run(repo, "engine_store_restore ios out", cache).returncode != 0


def test_the_first_publish_of_an_engine_is_the_one_kept(repo, tmp_path):
    cache = tmp_path / "cache"
    (repo / "out").write_text("first\n")
    run(repo, "engine_store_publish wasm out", cache)
    (repo / "out").write_text("second\n")
    run(repo, "engine_store_publish wasm out", cache)
    assert run(repo, "engine_store_restore wasm got", cache).returncode == 0
    assert (repo / "got").read_text() == "first\n"
    # No half-written copy is left beside it.
    assert [p.name for p in (cache / "engine" / key(repo, cache)).iterdir()] == ["wasm"]


def test_ci_neither_keeps_nor_reuses(repo, tmp_path):
    cache = tmp_path / "cache"
    (repo / "out").write_text("built\n")
    run(repo, "engine_store_publish wasm out", cache, CI="true")
    assert not (cache / "engine").exists()


@pytest.mark.skipif(not TURNS.exists(), reason="the script is outside this image")
def test_a_turn_is_named_to_the_command(tmp_path):
    env = {
        "ONE_AT_A_TIME_LOCK": str(tmp_path / "heavy.lock"),
        "ONE_AT_A_TIME_SLOTS": "2",
        "ONE_AT_A_TIME_FREE_MIN": "0",
        "ONE_AT_A_TIME_CONF": str(tmp_path / "none"),
        "PATH": "/usr/bin:/bin",
    }
    (tmp_path / "heavy.lock").mkdir()
    (tmp_path / "heavy.lock" / "owner").write_text(f"{os.getpid()} another build (since 01:00)\n")
    out = subprocess.run(["bash", str(TURNS), "a build", "sh", "-c", "echo $ONE_AT_A_TIME_SLOT"], env=env, capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip() == "2"
