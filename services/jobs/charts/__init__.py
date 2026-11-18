"""The charts job (services/jobs/charts): the FAA chart cycle's raster
tiles and the map's overlay tiles, built once a cycle in a container of
their own so the planner only serves them. `python -m charts <command>`;
cli.py lists the commands, overlays.py builds the vector tiles (their
layers overlay_layers.py, nasr_layers.py, airports.py, sua_labels.py), and
wingtip.charts does the chart work both the job and the planner share."""
