"""The guards every suite here shares (services/planner/pytest_guards.py,
docs/CI.md, "Flaky tests"), for the jobs' suite as for the planner's."""
from pytest_guards import _module_doubles_restored, pytest_collection_modifyitems  # noqa: F401
