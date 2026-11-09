"""The figure formats' example table, for design_tokens.py.

design/tokens.json's format group holds, for each way a figure is written
(a cruise altitude, a duration, a heading), its [input, written] pairs.
They are written beside the engine's shared fixtures as the one table
every app's formatter is tested against.
"""

import json


def gen_formats(formats, camel, banner):
    """Each format's name (camelCase), what it is for, and its
    [input, written] pairs, from the group's tokens, name to token."""
    table = {
        camel(k): {"description": t.get("$description", ""), "examples": [{"input": i, "written": w} for i, w in t["$value"]]}
        for k, t in formats.items()
    }
    return json.dumps({"$comment": banner, **table}, indent=2, ensure_ascii=False) + "\n"
