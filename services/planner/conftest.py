"""The guards every suite here shares (pytest_guards.py, docs/CI.md, "Flaky
tests"), for both of the planner's suites: tests/ and tests_wingtip/."""
from pytest_guards import _module_doubles_restored, pytest_collection_modifyitems  # noqa: F401
