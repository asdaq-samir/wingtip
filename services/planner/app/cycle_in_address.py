"""The chart cycle in a request's address, for the routes whose answer is
the chart's: the course and the checkpoints."""

from typing import Annotated

from fastapi import Query


def in_address(
    c: Annotated[
        str | None,
        Query(
            description="The chart cycle the page draws, as the chart tiles carry it: unread "
            "here, but in the address, so an answer a browser or service worker kept from last "
            "cycle is never taken for this cycle's"
        ),
    ] = None,
) -> None:
    """Nothing to do with it: the web's service worker keys its kept
    answers on the address, so a new cycle is a new address (the tiles'
    `c`, apps/web lib/map/sources/tiles)."""
