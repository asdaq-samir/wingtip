""" "When should I go?": the Go / No-Go for each departure hour the
forecasts reach, and the best windows to leave in (POST
/api/departure-window, app.routers.window).

- `schemas`: the question and the answer;
- `hours`: the hours asked, the plan and the briefing for each, and the
  engine's departure_window over them all, asked once.

The rules are the engine's (wingtip_engine::gonogo::window over the Go /
No-Go's own); the findings each hour is fed are app.gonogo.flight's
(findings_for), the very ones POST /api/go-no-go gives the phones; the
forecast data is wingtip.departure_window's."""
