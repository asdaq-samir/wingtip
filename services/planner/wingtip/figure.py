"""A figure read out of a feed's or a file's field."""

from __future__ import annotations


def number(value) -> float | None:
    """The field as a float; None where it is blank, missing, not a number
    or NaN (a feed's way of saying "unknown", which would otherwise slip
    through every comparison as a figure). Text is read with its padding,
    as the FAA's fixed-width files and the traffic feeds send it."""
    try:
        figure = float(value)
    except (TypeError, ValueError):
        return None
    return figure if figure == figure else None
