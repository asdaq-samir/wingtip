# Google Play: the foreground-service declarations

Play Console › App content › Foreground service permissions asks, for
each foreground-service type the manifest declares
(`apps/android/app/src/main/AndroidManifest.xml`; one, location, in
this build), what the user does
that starts it, what it does, what happens if it is deferred, and a short
video of it in use (Play Console Help, "Understanding foreground service
and full-screen intent requirements", answer 13392821). The text below is
what to paste, one block per type; the video shot list is in
[preview-video.md](preview-video.md).

## Location (`FOREGROUND_SERVICE_LOCATION`, `flight/OwnShipService`)

**Use case:** Navigation.

**What the user does:** With their airplane shown on the map (the
location button), once the airplane reaches flying speed the app asks
"Start Flight?" in a dialog. The service starts only when the pilot taps
Start Flight (`flight/StartFlightAsk.kt`, `flight/StartFlight.kt`); Not
Now leaves the position read only while the app is in front, and the app
does not ask again that flight.

**What it does:** Keeps the airplane's position coming with the screen
off or the app in the background during the flight, for what a pilot
needs while flying: the alerts ahead (airspace, TFRs, terrain) said
aloud, the next checkpoint's time and fuel on the status bar's Live
Update, and the path flown for the logbook. A notification, "Flying",
shows the whole time. It stops by itself as the airplane slows below
flying speed after landing, or when the pilot turns the location button
off. The app asks only for location while in use
(`ACCESS_FINE_LOCATION`), never `ACCESS_BACKGROUND_LOCATION`.

**If it is deferred:** The pilot loses the alerts ahead, the time and
fuel to the next checkpoint and the track of the flight whenever the
screen turns off in flight, which is when they are needed: a pilot's
eyes are outside, and the phone is often locked on a kneeboard.

**Video:** Show the map with the airplane, the dry run or a drive at
flying speed raising "Start Flight?", the tap on Start Flight, the
"Flying" notification, the screen locked with the Live Update counting
down, and the notification gone after slowing down.

## Not declared in this build

The microphone type (`atc/AtcListenService`, the ATC copilot) and the
connected-device type (`receiver/ReceiverService`, the cockpit ADS-B
receiver) are left out of the manifest while those features are parked
(the feature review, [feature-review.md](feature-review.md), 2026-11-21;
Settings' Extras, off to start). With a switch on, each works only while
the app is in front, so Play asks no declaration or video for either.
Their texts come back here, with the permission and the service, when
the feature does.
