"""The tests run anywhere Python does: the package from beside them, and
wingtip.units from the planner (standard library only), as the runner
puts services/planner on PYTHONPATH."""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO / "services" / "planner"))
