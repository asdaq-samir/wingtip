"""app/generated is what scripts/build/assistant_client.py makes from the
planner's OpenAPI document and the engine's contract, and the rule tools
are the contract's tagged rules, whole: CI's check that the committed
output matches its sources (run here, so scripts/dev/check.sh assistant
runs it too)."""

import json
import subprocess
import sys
from pathlib import Path

from app.generated.engine_tools import TOOLS

ROOT = Path(__file__).resolve().parents[3]
CONTRACT = json.loads((ROOT / "engine/contract/engine.schema.json").read_text())


def test_the_committed_generated_code_is_what_its_sources_make():
    run = subprocess.run([sys.executable, str(ROOT / "scripts/build/assistant_client.py"), "--check"], capture_output=True, text=True)
    assert run.returncode == 0, run.stdout + run.stderr


def test_every_rule_the_contract_tags_is_a_tool_and_no_other():
    tagged = [name for name, entry in CONTRACT["properties"].items() if entry.get("x-tool")]
    assert [t["name"] for t in TOOLS] == tagged
    assert len(tagged) >= 30


def test_each_tool_carries_its_rules_description_and_a_schema_that_stands_alone():
    for tool in TOOLS:
        entry = CONTRACT["properties"][tool["name"]]
        assert tool["description"] == entry["description"]
        assert tool["input_schema"]["type"] == "object"
        # The contract's definitions written in: Claude reads no $ref.
        assert "$ref" not in json.dumps(tool["input_schema"]), tool["name"]
        given = set(entry["properties"]["input"].get("properties") or {})
        assert given <= set(tool["input_schema"]["properties"]), tool["name"]


def test_every_tool_names_the_regulation_or_handbook_it_rests_on_where_it_states_a_rule():
    # Each tagged rule is a figure a pilot is told; its description is the
    # model's only account of where it comes from (CLAUDE.md, "Aviation").
    sources = ("CFR", "AIM", "AC ", "PHAK", "FAA-H-", "ICAO", "POH", "WMM", "WGS 84", "TPP", "91.", "61.", "97.")
    unsourced = [t["name"] for t in TOOLS if not any(s in t["description"] for s in sources)]
    assert unsourced == [], unsourced


def test_the_planners_allow_list_is_the_tools_and_the_assistants_own_checks():
    # The tools, and the rules tagged "x-assistant" (app.documents' checks
    # of a photographed page), which are not the pilot's tools.
    text = (ROOT / "services/planner/app/generated/engine_tools.py").read_text()
    own = [n for n, e in CONTRACT["properties"].items() if e.get("x-assistant")]
    assert {"handbook_read_check", "logbook_read_check"} <= set(own)
    allowed = [line.strip().strip(",'") for line in text.splitlines() if line.startswith("    '")]
    assert allowed == sorted([t["name"] for t in TOOLS] + own)
    assert not set(own) & {t["name"] for t in TOOLS}
