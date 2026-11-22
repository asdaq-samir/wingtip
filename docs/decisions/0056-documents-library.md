# 0056. A documents library and reader, and every cited rule a tap to its paragraph

- **Date:** 2026-11-21
- **Status:** Proposed. Built on the web as the proof of concept
  (decision 0038). Its home under You, and the phones following, are the
  owner's to confirm.
- **Asked:** the owner, 2026-11-21: "Go full throttle. Do we support
  document library/reader like ForeFlight does?"

## Context

We had no library. The iPhone reads photographed POH, W&B, logbook and
clearance pages. The web shows the FAA's charts and plates in its chart
viewer. A pilot who wanted 91.155's words, or the AIM's paragraph a
Brief finding cites, left the app.

ForeFlight's Documents (foreflight.com/products/foreflight-mobile/documents,
read 2026-11-21) offers this:

- hundreds of free government documents, the FAA's among them;
- downloads that update themselves on Wi-Fi when a new version comes out;
- a document-wide search, a table of contents and named bookmarks in one
  panel;
- markup and notes, and Invert Colors for the night;
- the pilot's own files (PDF, images, Office documents) from Files,
  Photos, AirDrop or email, sorted into binders, backed up to ForeFlight's
  cloud with markup and bookmarks synced between devices;
- cloud drives (Dropbox, Box, S3, OneDrive) on its higher plans.

Its support pages refused automated fetches that day, so which FAA
titles its catalogue holds, and whether its regulation citations link
into Documents, were not confirmed. Nothing found said they do.

## Decision

1. **The FAA's shelf, kept current by the planner.** `wingtip.library`
   fetches each document's current edition once a day into the data
   volume, and the app reads it through the generated client (data in at
   the edges). The documents are 14 CFR parts 1, 43, 61, 68, 91, 97, 99
   and 135 and 49 CFR 830 from the eCFR's API, the AIM, the PHAK, the
   AFH, the IFH, the Instrument Procedures Handbook, the Aviation Weather
   Handbook, the Risk Management Handbook, the Chart Users' Guide and
   twelve advisory circulars pilots use. The Chart Supplement stays
   `wingtip.publications`', opened from the library by a field's ident.
   All of them are public domain, credited once in Settings' Sources.
   Each shows its edition and date. A new edition replaces the old on the
   server, and on a device that kept the old one.
2. **One reader, stock.** pdf.js (pdfjs-dist, Apache-2.0, the newest)
   and its own viewer for PDFs, loaded only when a document opens. A CFR
   part is read as text in the app's own type, each section an anchor.
   The reader has a search, the outline, named bookmarks, the page left
   at, a pinch's zoom, inverted pages for the night and a page shared as
   a link. Keep for the Air keeps a document whole on the device
   (IndexedDB, idb-keyval).
3. **The pilot's own PDFs stay on the device.** They are added from the
   device's files, renamed in place and deleted with an Undo, and never
   sent. There is no sync. Any sync later goes through the gateway's
   records and the privacy inventory first.
4. **Every cited rule is a tap to its paragraph.** This is our
   differentiator. The engine owns the cite strings already (the Go /
   No-Go's whys, the airspace entry rules, currency, endorsements). A new
   rule, `citations` (wingtip-wording's `cite.rs`), reads any text into
   pieces, each cite named by its document and place: `cfr-14-91` at
   `91.155`, `aim` at `7-1-5`, `ac-61-65`. The web's `Cited` draws each
   one as a link where the shelf holds the document. The shelf names its
   documents the same way, and a test holds the two together, so no
   screen keeps a copy of where a rule lives.
5. **The library's home is You** (the account button), a row among the
   pilot's other things: Airplanes, Flights, Logbook, Minimums,
   Documents, Training. It is not in the Map card, which is what the map
   draws, nor in Settings, which is how the app behaves. The one search
   finds it by name, and a cite opens the reader over wherever the pilot
   is. No panel or control moved.

## What we left out, for now

- ~~**Markup and notes.**~~ Built the same day on the owner's word ("Ok
  just go maximum output", "I will take your recs"): pdf.js's own
  annotation editors for highlights and ink, our eraser, palm rejection
  and notes, kept on the device beside the PDFs and never sent, a notes
  list in the contents, and a page shared with its marks flattened
  (web.md 13a, "Markup and notes"). No new dependency.
- **Images and Office files.** PDFs only. A photographed page is the
  iPhone's page reader's.
- **Binders and cloud drives.** One list of the pilot's own documents.
- **Sync of the pilot's own documents.** Point 3 says how it would come.

## Consequences

- The planner keeps some 300 MB of books on the data volume. The CI
  stack fetches none (`FAA_LIBRARY_REFRESH=0`), and its specs stub the
  shelf.
- The FAA's pages are scraped for their current link. A page redesigned
  leaves the edition kept as it was and logs the miss; the planner never
  serves a file it could not check was a PDF.
- The web's first load is unchanged. The reader, pdf.js and its worker
  are their own chunks and assets, precached by the service worker so a
  kept document opens with no signal.
- The phones follow on the owner's word: each gets the same `citations`
  rule from the engine, and its platform's own reader (PDFKit, Android's
  PdfRenderer).
