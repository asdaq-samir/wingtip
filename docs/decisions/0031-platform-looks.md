# 0031. Each platform may look its own best

- **Date:** 2026-11-04
- **Status:** Accepted

## Context

Web, iOS and Android have different conventions, and the native apps now exist.

## Decision

Web, iOS and Android may look different as long as each is the best for its platform; every function must stay reachable on each. The web-first hold was lifted on 2026-11-06, and native work goes ahead. Judge every screen at an iPhone's width against Apple's Human Interface Guidelines first.

## Consequences

A function in one app but not another needs a reason. How a figure is written stays with each app.

## Source

The owner, 2026-11-04 and 2026-11-06.

## Amended 2026-11-10

Each app has a fourth look, Native, after Wingtip, Glass Cockpit and
Chart ink: the platform as it comes out of the box (the owner: "Native
means how they come out of the box, look and behavior wise"). On the web
shadcn's stock base-vega theme; on the iPhone iOS's own, with the
system's accent (the app names no accent colour); on Android plain
Material with Material You's colours from the wallpaper (Android 12 and
later). In every look the chart's colours, the course, airspace, flight
categories and the caution, go and no-go states stay Wingtip's: they are
aviation's meaning, not chrome. The tokens are `design/tokens.json`'s
`color.look.native`.
