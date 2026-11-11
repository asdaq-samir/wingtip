# ruff: noqa
# The names vulture (scripts/ci/dead_python.sh) takes for unused at 80%
# confidence that are used, each with why. vulture reads this file as code
# that uses them; nothing imports it. A new entry is a name the tool cannot
# see the use of, never one that is dead: delete dead code instead.

# A Pydantic model named in a string annotation of the models above it in
# app/schemas/system.py, resolved by model_rebuild().
NextCycle

# pytest fixtures a test asks for by parameter for what they set up (a
# store written, a module patched), not for a value it reads.
a_vfr_waypoint
east_of_madison
flat_world
remarks_csv
round_oshkosh
the_rockford_dme
two_abs
two_tfrs

# A stand-in's parameters, named as the real call's are so the code under
# test can pass them by keyword: concurrent.futures' Executor.shutdown, and
# chart_model.predicted_scores' landmarks.
cancel_futures
ls
