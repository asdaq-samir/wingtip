# 0051. A confirmation is the stock centred alert at every width

- **Date:** 2026-11-20
- **Status:** Accepted

## Context

A confirmation (Clear Route, delete account, a discard, a logbook delete,
a removal) opened as a bottom sheet on a phone, a card in effect, though
the one card rule (0033) is for things and pages, not for a question the
pilot answers in a word.

## Decision

A confirmation is Base UI's AlertDialog, centred over the page at every
width, with Cancel beside the action, the action's words and destructive
red as they were, and its Undo (the owner, 2026-11-20: "the confirmation
shouldn't open a new card"; e92fc8cfc). Ready to Fly's prompt, the
altitude and fix dialogs and the error alert are not confirmations and keep
the phone's sheet.

## Consequences

- `useConfirm` sets `SheetDialog`'s `centered`; its eleven users are
  unchanged. Errors still show where they happen (`lib/problems`).
- The phones' own confirmations are the platform's stock alert already.
