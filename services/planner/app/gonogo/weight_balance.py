"""The airplane's weight and balance (apps/web/src/lib/weightBalance.ts): what
the pilot loads -- its own empty weight and arm (from its weight and
balance record), each station's pounds in the loading's order, and the
fuel at the start in gallons -- against its POH's loading: the weights,
the centre-of-gravity envelope and each station's most (the POH's
section 6; 14 CFR 91.9(a), its limitations). The sums and the problems in
words are the engine's (wingtip_engine::gonogo::weight_balance), asked by
name through wingtip_native.call, as the web app asks them."""

from . import ask


def with_empty(loading: dict, fuel_gal: float) -> dict:
    """A load built on the loading's empty weight and moment (read to an
    arm) with `fuel_gal` aboard, by the engine's gonogo_default_load. Its
    stations are that rule's placeholders, the POH's sample and a pilot of
    170 lb: the caller puts the pilot's own in before balancing it, as the
    connector does (app.mcp.airplane), and no verdict balances them as the
    flight's load (go/no-go sends no_load instead)."""
    return ask("gonogo_default_load", loading=loading, fuel_gal=fuel_gal)


def balance(loading: dict, load: dict, trip_fuel_gal: float | None) -> dict:
    """The weight and centre of gravity at takeoff -- the ramp's, less the
    start and taxi fuel -- and at landing, less the trip's fuel, each
    against the loading's limits: the most it may weigh, the envelope,
    and each station's and the baggage's own most; with the takeoff's
    weight and centre of gravity in the Go / No-Go row's words,
    `takeoff_words` ("2,407 lb at 41.2 in"), the engine's too."""
    return ask("gonogo_balance", loading=loading, load=load, trip_fuel_gal=trip_fuel_gal)
