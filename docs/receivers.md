# Cockpit ADS-B receivers

Which portable ADS-B receivers the iPhone, iPad and Android apps read, what
the apps take from each, and how it is tested. The receiver's GDL 90 is
read by the engine (`engine/crates/receiver`). The phones only listen on
UDP port 4000 and hand the bytes over (`Receiver/ReceiverListener.swift`,
`receiver/ReceiverSocket.kt`).

## The switch

The receiver is parked behind one switch on each platform. Off, nothing
listens, and no setting, map chip, Brief section or Ready to Fly item
mentions it.

| Platform | Switch | Now | Why |
|---|---|---|---|
| iPhone, iPad | `WingtipReceiver` in `apps/ios/project.yml` (`Receiver.enabled`) | **Off** | Without Apple's multicast networking entitlement, a receiver that broadcasts is never heard. The request is in [store/launch-checklist.md](store/launch-checklist.md), at the top. |
| Android phones and tablets | `RECEIVER_ENABLED` in `apps/android/app/build.gradle.kts` (`Receiver.ENABLED`) | **On** | Android hears a broadcast once the app holds the Wi-Fi multicast lock (`CHANGE_WIFI_MULTICAST_STATE`). No grant is needed. |

**The day Apple grants the entitlement:**

1. Add `com.apple.developer.networking.multicast: true` to
   `apps/ios/Wingtip/Wingtip.entitlements` (project.yml's `entitlements`).
2. Set `WingtipReceiver: true` in `apps/ios/project.yml`.
3. Run `xcodegen`, then fly with a Stratux and a Sentry.
4. Take the qualifier off the listing's receiver line
   ([store/listing.md](store/listing.md)).

## What the apps take from a receiver

- **Own ship.** The receiver's GPS becomes own ship when the device has no
  position of its own (a Wi-Fi iPad or tablet), or when the receiver's is
  at least twice as good. The engine decides (`receiver_position`), using:
  - The receiver must be heard: a Heartbeat within the last 5 s.
  - Its Heartbeat must say GPS Pos Valid (GDL 90 3.1.1).
  - Its Ownship Report must be under 3 s old and not extrapolated (AC
    120-76D 11.17.2.3's three seconds).
  - Its NIC and NACp must reach 14 CFR 91.227(c)(1)'s floor: NIC 7
    (under 0.2 nm) and NACp 8 (under 0.05 nm).

  When the receiver's fix goes stale, the device's own fix is taken back
  at once. With neither, no airplane is drawn. The map's receiver chip
  says "Your position from Stratux" while the receiver's fix is in use. If
  the receiver's fix is unusable, the chip says why: "Stratux has no GPS
  fix" or "Stratux's GPS too weak to show". Settings shows Position: from
  this device, or from the receiver.
- **Height.** The height is the receiver's GPS (geometric) altitude
  (GDL 90 3.8):
  - Where the ID message says the receiver's heights are MSL
    (capabilities bit 0), it is used as given.
  - Where they are above the WGS-84 ellipsoid (GDL 90's own datum),
    Android puts the height on the geoid with
    `AltitudeConverterCompat`, as it does for its own fixes. iOS has no
    geoid model, so it shows no height, which is better than a height 30
    to 115 ft out.
  - A Vertical Warning means no GPS height is used.

  Pressure altitude is used only where the rules use it. It puts the
  traffic's heights on own ship's scale (`receiver_traffic`). It is given
  as a flight level at and above 18,000 ft, where the altimeter is set to
  29.92 (14 CFR 91.121(a)(2), 1.1).
- **Traffic.** The receiver's targets are drawn ahead of the internet's,
  merged by ICAO address. An airplane's card says "Heard by Stratux 3 s
  ago". Traffic helps the pilot see airplanes, never avoid them (AIM
  4-5-7).
- **FIS-B weather:**
  - NEXRAD is drawn over the chart, and the chip gives its age ("Radar
    from receiver 4 min").
  - A field's METAR and TAF appear on its card when the weather service
    has none.
  - The Brief's "From Your Receiver" section lists the route's fields as
    FIS-B sent them, each with when it was heard.

  FIS-B should not be the only source of weather (AIM 4-5-9).

## Supported receivers

Each sample in `apps/web/src/lib/fixtures/gdl90-receivers.json` is a GDL
90 datagram of the shape that receiver sends. They are built by
`engine/crates/receiver/tests/receivers.rs` from the specification's
layouts, not recorded from the units. A unit's datum is read from its own
ID message at run time, so the samples cover both datums rather than
vouch for each unit's. `engine/facade/tests/receiver_position.rs` reads
each sample and asks own ship of it. Record a real unit's stream (Wi-Fi
capture of UDP 4000) and add it beside the built samples once one is in
hand.

| Receiver | GDL 90 over Wi-Fi | Says who it is | Sample | Notes |
|---|---|---|---|---|
| Stratux | Yes ("Standard GDL90 output", stratux.com) | Its own 0xCC heartbeat, and ForeFlight's ID message | `stratux`, `stratux-no-fix` | The ID message's MSL bit is taken from Stratux's source as read before; not re-checked on 2026-11-21. |
| ForeFlight Sentry | Yes, ForeFlight's GDL 90 extension | ID message "Sentry" | `sentry`, `sentry-weak` | ForeFlight's page names OzRunways as a third-party app; the support article was not reachable on 2026-11-21. |
| uAvionix SkyEcho 2 | Yes: "GDL90 over Wi-Fi", "compatible with any GDL 90 standard protocol EFB application" (uavionix.com) | ID message | `skyecho` (ellipsoid datum) | Its manual's datum was not read; the app reads the bit. |
| Appareo Stratus 3 / ESG, open mode | Said to be, in its open GDL 90 mode | None assumed | `stratus-open` | Unverified from Appareo. Without an ID message the specification's ellipsoid datum applies. |
| Garmin GDL 39, GDL 52 | **Not supported**: they speak Garmin's Connext, over Bluetooth | -- | none | Garmin's pages load by script and were not read. A Garmin unit with a GDL 90 Wi-Fi output would work like the others. |

Bluetooth GPS units (Bad Elf, Dual) already feed Core Location and
Android's fused provider for every app, so they need nothing here.

## Sources

- Garmin, GDL 90 Data Interface Specification, 560-1058-00 Rev A
  (sections cited in the crate). faa.gov's copy refused automated fetches
  on 2026-11-21.
- ForeFlight, GDL 90 Extended Specification
  (foreflight.com/connect/spec, read 2026-11-21): port 4000 and unicast
  advised; the ID message's capabilities bit 0, "0: WGS-84 ellipsoid (as
  the GDL90 spec states)", "1: MSL".
- 14 CFR 91.227(c)(1), 91.121(a)(2) and 1.1 (read 2026-11-21).
- AC 120-76D 11.17.2.3, as already cited by `OwnShip.swift`. faa.gov
  refused automated fetches on 2026-11-21, so it was not re-read.
