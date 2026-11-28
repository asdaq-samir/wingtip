"""Reading the FAA's SWIM messages (STDDS, TFMS, ITWS, SFDPS): an
element's name without its namespace, the first element of a name
wherever it sits, its text, and a number read from text. Each module
that reads a message wrote its own copies."""

from __future__ import annotations


def local(tag: str) -> str:
    """A tag's name without its namespace: "{urn:...}airport" is "airport"."""
    return tag.rsplit("}", 1)[-1]


def first(element, name: str):
    """The first element named `name` (its local name) in `element`, itself
    included, in document order; None where there is none."""
    return next((e for e in element.iter() if local(e.tag) == name), None)


def text(element, name: str) -> str:
    """The text of the first element named `name`, stripped; "" where
    there is none or it is empty."""
    found = first(element, name)
    return (found.text or "").strip() if found is not None else ""


def number(text: str | None) -> float | None:
    """A message's figure as a number; None where it is missing or not one."""
    try:
        return float(text) if text not in (None, "") else None
    except ValueError:
        return None
