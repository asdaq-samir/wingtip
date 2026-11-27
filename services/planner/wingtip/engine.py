"""The shared engine (wingtip_engine, engine/facade), asked a rule by its
name with JSON in and out (wingtip_native.call), the one way in the web
app (callEngine) and the phones (the generated `call`) use too. Each name and its
shapes: engine/contract/engine.schema.json."""

import json

import wingtip_native


def ask(name: str, /, **given):
    """The engine's rule `name` on the input given, its answer parsed; an
    input not of the rule's shape is a ValueError with the engine's words.
    A date or a time is sent as its text (str), as the Go / No-Go's were."""
    return json.loads(wingtip_native.call(name, json.dumps(given, default=str)))
