# Wingtip in Claude and ChatGPT: the help page and the directory listing

The words for the connector's public documentation (the help page a
directory requires by the publish date) and for Anthropic's developer
portal (claude.ai/directory/manage, "MCP connector"), as its steps ask
for them (claude.com/docs/connectors/building/submission, read
2026-11-22). Nothing here is submitted: the connector is off in
production until the owner turns it on (decision 0061, design section 7).

## The help page: add Wingtip to Claude

**Wingtip in your own Claude.** Plan a flight by talking to Claude, and
watch it take shape in Wingtip beside the chat: the route on the FAA
sectional, the figures, the approach, the fuel stops. Ask Claude to change
anything, or tap it in the view. Save it, and it is in Wingtip's Flights on
your phone and iPad.

1. In Claude (the web, the desktop app or the phone app), open
   **Customize > Connectors**, choose **Wingtip Maps** in the directory (or,
   before it is listed, **Add custom connector** with the address
   `https://wingtipmaps.app/mcp`), and **Connect**.
2. Sign in to Wingtip as you do in the app (Google, Apple, or an emailed
   link) and approve. Untick **Save, change and delete your saved flights**
   if you want Claude to plan and show flights but never change your
   account.
3. In a chat, turn Wingtip on under **+ > Connectors** and ask, for
   example:
   - "Show my flight from Chicago Executive to Duluth in Wingtip on
     N123AB."
   - "Add a stop at Madison and cruise at 6,500."
   - "Load the ILS 27 at Duluth and activate it."
   - "Do I need fuel stops? Put them in."
   - "Save it to Wingtip."
4. Claude asks before it shows Wingtip's view and before anything that
   saves, changes or deletes a saved flight. **Open in Wingtip** opens the
   same flight in the app.

To end it: in Wingtip, **You > Connected Apps > Disconnect**, or remove
the connector in Claude's settings.

**ChatGPT:** with developer mode on, chatgpt.com/plugins, **Add custom
MCP server**, the same address, OAuth; the same tools (which ChatGPT plans
have developer mode is not yet checked: design section 1).

**What leaves Wingtip:** only what you ask about, and only to the AI app
you connected: the route, the figures, your airplane's figures and your
saved flights' routes. Never your logbook, your notes or your risk
assessments. The privacy policy has the rest.

## The directory submission

- **Server URL:** `https://wingtipmaps.app/mcp` (one URL for every
  pilot: "Universal URL").
- **Name:** Wingtip Maps
- **One-liner (200):** Plan VFR and IFR flights on the FAA chart, and see
  the route, figures, approach and fuel stops live in Wingtip as you talk.
- **Description (2,000):** Wingtip Maps is a US flight planner for VFR and
  IFR pilots. Connected to Claude, it plans a flight with you step by step
  and shows it beside the chat: the route over the FAA sectional, the time
  en route, distance and fuel, the cruise altitude and why, and each stop
  and approach. Ask Claude to add, move or remove a stop, change the cruise
  altitude or departure time, load and activate an approach and its missed
  approach, put in the fuel stops the flight needs with its legal reserve,
  set the fuel on board, or fly it on one of your own airplanes; or tap the
  change in the view. Claude can also read an airport's facts, its METAR,
  TAF and NOTAMs, the nearest fields, and give the flight's Go / No-Go
  briefing. Every figure comes from Wingtip's own planner and rules engine,
  each citing its 14 CFR section or AIM paragraph and the FAA data set and
  edition it rests on. Save the flight and it is in Wingtip's Flights on
  your phone and iPad. Third-party text (NOTAMs, weather remarks) is
  reported as data. A planning aid: always brief with official sources
  before flight.
- **Categories:** Travel; Productivity (one to five).
- **Documentation URL:** the help page above, published on the site.
- **Privacy policy URL:** `https://wingtipmaps.app/privacy`.
- **Support contact:** the support page's address.
- **Icon:** the app's icon (design/brand).
- **Use cases:** plan a cross-country flight with the nav log; brief a
  flight's Go / No-Go; set up an IFR approach and its missed approach;
  find fuel stops; read a field's weather and NOTAMs. Needs a Wingtip
  account (free); an airplane saved in Wingtip for times and fuel.
  Reads and writes (saved flights, with the pilot's consent).
- **Authentication:** OAuth 2.0, "Always required", Dynamic Client
  Registration (the gateway's `/oauth2/register`; Spring Authorization
  Server has no CIMD yet), the callback
  `https://claude.ai/api/mcp/auth_callback` and Claude Code's loopback
  ones accepted.
- **Data handling:** our own first-party API; no personal health data; no
  sponsored content.
- **Allowed link URIs:** `https://wingtipmaps.app` (Open in Wingtip).
- **Test account (Verified review, by email, never in the portal):** a
  pilot with two airplanes (one with full figures) and three saved
  flights, one with an approach loaded.
- **Tools:** every tool has a title and its hints (design section 4); the
  portal groups them: read-only (21), write (4).

### The carousel screenshots (MCP App)

Three to five PNGs, at least 1000 px wide, cropped to the view, the prompt
given beside each (not in the picture). Taken on claude.ai in the side
panel at 1280 px, light theme:

1. "Show my flight from Chicago Executive to Duluth in Wingtip on N123AB":
   the route over the sectional, the figures and the points.
2. "Add a stop at Madison and put in the fuel stops I need": the stop and
   the fuel stop's pump mark.
3. "Load the ILS 27 at Duluth and activate it": the approach's row, active,
   its missed approach suspended.
4. "Save it to Wingtip": the view after Save, and the flight in the app.
