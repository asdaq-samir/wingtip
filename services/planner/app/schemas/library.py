"""The documents library: the shelf of the FAA's publications and the CFR
parts a pilot reads, each in its current edition (wingtip.library), and a
CFR part's text (wingtip.ecfr)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class LibraryDocument(BaseModel):
    """One document of the shelf, by the name the engine's citations give
    it (cfr-14-91, aim, ac-61-65, phak)."""

    id: str
    title: str
    #: "Regulations", "AIM", "Handbooks", "Advisory Circulars" or "Charts".
    group: str
    #: A PDF, or a CFR part's text.
    kind: Literal["pdf", "text"]
    #: The edition kept, as the file's address names it; None while it has
    #: never been had.
    edition: str | None
    #: The edition as a pilot reads it: "FAA-H-8083-25C", "Change 2", "eCFR".
    label: str | None
    #: The day it was issued or last changed, YYYY-MM-DD.
    date: str | None
    bytes: int | None


class Library(BaseModel):
    """The shelf in its order."""

    documents: list[LibraryDocument]


class CfrSection(BaseModel):
    """A section, or an appendix or SFAR read as one."""

    #: Its number, "91.155"; an appendix's name.
    id: str
    head: str
    paragraphs: list[str]


class CfrGroup(BaseModel):
    """A subpart, or the sections before the first."""

    head: str
    sections: list[CfrSection]


class CfrText(BaseModel):
    """A CFR part's text in one edition (the eCFR's issue date)."""

    head: str
    groups: list[CfrGroup]
