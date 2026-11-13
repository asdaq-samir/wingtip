# Privacy policy

*Draft for the owner to review. Checked against the code on 12 November 2026; not yet in effect.*

Wingtip Maps is a flight planner for VFR and IFR flight, on the web, the iPhone and Android. This page says what the app keeps about you, where it keeps it, what leaves your device and who receives it. It describes what the app does today; where it says "we", it means the people who run Wingtip Maps.

You can use the map and plan a route without an account. Most of what follows is about the account you may make, and about the features that send something off your device to work.

## What we keep for your account

When you sign in, our server keeps, in its database:

- **Who you are:** your email address, the name you sign in with and your account's number; if you sign in with Google or Apple, the identifier that provider gives us for you, and for Apple the token that lets us end that sign-in when you delete your account. We hold no password: there is none.
- **Your sign-in:** a session that keeps you signed in until you have not used the app for 30 days. The link we email you to sign in is kept only as a one-way hash, works once, and lasts 15 minutes.
- **What you give the app:** your telephone number and home base, if you add them; your name as on your pilot certificate, if you give it for endorsements; your medical, flight review and instrument proficiency check dates and your knowledge test codes; and, if you instruct, your flight instructor certificate number and its date.
- **What you save:** your airplanes (tail number, type, performance figures, inspections and checks, due items and squawks), your saved flights with their nav logs and risk assessments, your logbook, your endorsements, the approaches an instructor sets you as lessons, and the checkpoint notes you write for yourself.
- **Flown tracks**, as GPS points, only when you choose to save one to a flight.
- **Your instructor and students:** the instructors you ask in by address, the saved flights you put to them, and the endorsements signed in the app between you.
- **Flights you share:** when you share a saved flight, a random link to it, whether its N-number goes with it, and when you shared it. Anyone with the link can read the flight's route, stops, altitudes, departure time, airplane type and nav log, but never your name, email, notes or risk assessment, and the N-number only if you choose to include it. Stop Sharing in the flight's menu ends the link for everyone; deleting the flight or your account does too. A plan you share as a plain link is carried in the link itself and is not stored by us.
- **Flight watch:** for a saved flight you ask us to watch, its departure time and the last briefing we checked it against, so we can email you when the weather or NOTAMs on it change.
- **Reminders:** whether you want email before your currency or an airplane's due item runs out, and which reminders we have sent.

We keep these until you delete them or delete your account. We do not sell them, share them for advertising, or use them to track you across other companies' apps or sites.

## What stays on your device

The app keeps your settings, personal minimums, checklists, the charts and data you keep for flying without a connection, your recent flown tracks and your last known position on your device. The web app keeps them in your browser's storage; the iPhone and Android apps in their own storage. None of it is sent to us unless this page says so.

If you connect the iPhone or Android app to an ADS-B receiver in the cockpit, the traffic and weather it hears over the cockpit's Wi-Fi are read and shown on your device only; nothing of it is sent anywhere, and it is not kept past a few hours.

On the iPhone, the airplanes you keep or watch on the map and your planned routes are also kept in your own iCloud account, if iCloud is on for the app, so your other Apple devices have them. They go to Apple, not to us; we cannot read them. An Apple Watch paired with your iPhone receives the airplane, checklist and position the watch app shows.

## Your location

The app asks your device for your position only after you turn on the location arrow (or start flying, on a phone) and your device allows it. On the iPhone it keeps reading your position while the app is in the background only while you are flying, so the flight can be followed; on Android a notification shows while it does.

Your position is used on your device to draw your airplane and measure from it. It leaves your device when a feature needs it to answer:

- **to our planner,** to find the nearest airports, the airspace and alerts around and ahead of you, nearby traffic and emergency fields. The planner answers and does not keep it, and writes no position to its logs. For traffic it keeps, for one minute and without anything that says whose it is, only the half-degree square of the map (about 30 nautical miles across) the view is in, to fetch the radar there.

Your position is stored with your account only as a track you choose to save to a flight.

## Listening to the radio

When you turn on the ATC copilot, or speak to the app, it listens through your device's microphone and turns the speech into text, to show the calls addressed to you. The app records no audio, saves none to a file, and sends none to us.

- **In the iPhone and Android apps, speech is recognised on your phone and never leaves it.** They use only the recognizer that runs on the phone itself: Apple's on-device speech recognition on the iPhone, and the phone's on-device speech recognizer on Android (Android 12 and later). Where a phone cannot do that, the app does not offer voice, and you type instead; it never falls back to a recognizer on someone's servers.
- **In a web browser, the app uses the browser's own speech recognition.** Where the browser can promise that the audio stays on your computer or phone (Chrome, which may first download its English language pack), the app asks it to. Other browsers, such as Safari, may send the audio to their maker (Apple, for Safari) to be recognised, under that company's privacy policy. A browser with no speech recognition (Firefox) is not offered voice. Of the text, only the place names in a clearance you heard (a clearance limit, a route, a departure) go to our planner, to find them on the map; a question you ask aloud is treated as a typed question is.

## Siri and the camera on iPhone

On an iPhone, Siri can act on what the app shows: the airports, waypoints, NOTAMs, approaches, frequencies, airplanes and logbook entries on the screen, and your flight. The app tells the phone which of these is on the screen so Siri knows what "this airport" means; that stays between the app and your iPhone under Apple's privacy policy for Siri, and nothing more is sent to us than when you tap the same thing.

When you point the iPhone's camera at a chart, a plate, a weather printout or a sign and ask Siri about it, the picture is read on your phone. Only the airport identifiers found in it go to our planner, to find those airports; the picture is not sent to us.

## Words written on your phone

Our servers ask no AI model to write the app's words, and the app sends nothing to Anthropic for them. Some features are written on your phone, by its own model, where it has one; nothing is sent to us for those, and where your phone has no such model, they are not offered and the app shows its own figures and words. What a model writes can be wrong; the app says so where it shows it.

On an iPhone with Apple Intelligence, Ask, the words beside the Brief's figures, the NOTAMs in plain words and what a NOTAM means for your flight, a drafted logbook remark, a clearance said in full and why your plan flies its altitude are written by Apple's models, and a photographed page (a handbook page, a logbook page, a clearance you wrote down) is read on the phone (iOS 27).

Where the iPhone's own model cannot do one of these (it is still downloading, it cannot see a photo, or its answer did not pass our checks), the app may ask Apple's Private Cloud Compute instead: Apple's larger model on Apple's servers, which Apple designs so that what is sent is used only to answer and is never stored, and which we do not receive. What goes there is what that feature needs: the NOTAMs and why each matters, the logbook entry's columns and what the app found in your track, the clearance's words, the reasons for your altitude, your question to Ask with the figures the app worked out for it, the Go / No-Go's findings, or the photographed page. Apple counts it against your iCloud account's daily allowance.

On an Android phone that has Google's Gemini Nano (through Android's AICore; Setup's On-Phone AI says whether yours does), the app does these on the phone and sends nothing to us for them: Ask, the words beside the Brief, an airport's weather, the route's NOTAMs, the nav log and the Coach's debriefs, a drafted logbook remark, and the reading of a photographed page (its text is read by Google's on-device text recognition, then by Gemini Nano). Ask's look-ups still ask our planner for the airport, the route or the NOTAMs, as the screens do. Where the phone has no Gemini Nano, these are not offered.

## Assistants on your phone

On Android 16 and later, Google's Gemini and other assistants on your phone that Android allows can ask Wingtip Maps for an airport's card, its frequencies and approaches, the nearest airports, your planned route and its NOTAMs, the Brief's verdict, and your airplanes and logbook entries, and can open the app on a route, an airport or a screen. The app answers on your phone, only when you ask the assistant; what the assistant then does with the answer is under its maker's privacy policy (Google's, for Gemini). When you ask an assistant about what is on your screen, the app gives it the route you have planned, as a link. The app's shortcuts (a long press on its icon) open its screens and send nothing.

## Your own Claude or ChatGPT

You can connect Wingtip Maps to an AI app you use, such as Claude or ChatGPT, by adding Wingtip as a connector in that app and signing in with your Wingtip account. That app can then ask Wingtip for airports, the weather and NOTAMs at a field, a route's nav log and briefing, your own airplanes, and your saved flights as a summary (their name, route, airplane, altitude, distance, time, fuel and date, never their notes or risk assessment), and can save a flight to your account once you confirm it there.

Only what you ask about leaves Wingtip, and only to the app you connected. We do not send your name, email address or logbook. What that app does with the answers is under its maker's privacy policy (Anthropic's for Claude, OpenAI's for ChatGPT); we do not choose the model or pay for it, and we receive nothing from it but the questions its tools ask. We keep that you connected it and the sign-in it holds, which ends 30 days after the app last used it, or at once when you delete your account; we keep no record of what was asked, only a count of requests for a day, to limit how many one connection can make.

## Faults and speed

So we hear when the app breaks without you having to write in, each app sends us a report when something goes wrong:

- **the web app:** an error nobody caught, with its message and where in the app's code it happened;
- **the iPhone app:** the crash, hang and exception reports Apple's MetricKit gives the app, and its daily launch time, hang time, scrolling smoothness, most memory used and how often the system closed it for using too much;
- **the Android app:** why the app last stopped when the system stopped it (a crash, an app not responding, low memory), a crash's stack trace, and how long it took to start and how many frames were slow.

Each report carries the app's version, the system's version and whether the device is a phone, tablet or computer. It carries nothing of yours: no account, no address, no route, no position. Our server takes out any web address's query, any email address, any user name in a folder's path and any per-install identifier before keeping it. Faults are kept 30 days.

The web app also sends, when you leave a page, how fast it was on your device (Google's Core Web Vitals and how long the browser was busy), with the page's name, the kind of device and the app's version, nothing else. Speed figures from all three apps are kept 400 days, to see whether the app is getting faster or slower.

There is no analytics or advertising kit in any of the apps, and no third party receives these reports.

## Other airplanes' tracks

When anyone opens an airplane's card on the traffic map, our planner follows that airplane for 30 days from the last time its card was opened, and records its positions from the public ADS-B networks and the FAA's radar, so its card can show where it has flown. Each position is kept 30 days. Nothing about who opened the card is kept with it. If you open your own airplane's card, its flights are recorded the same way, as any airplane's are.

## Who else receives anything

- **Apple,** on an iPhone, for the features its Private Cloud Compute writes where the phone's own model cannot, as above; Apple uses it only to answer and does not keep it.
- **An AI app you connect Wingtip to** (Claude, ChatGPT), what you ask it about, as above.
- **Our email sender** (Amazon SES), which delivers the email we send: your sign-in link, the reminders you turn on, flight watch's changes, and the email between you and an instructor you ask in.
- **Your instructor or student,** once you ask them in: your name and address, the experience and endorsements in your logbook, your knowledge test codes, and the saved flights you put to them. Either of you can end it.
- **Google and Apple,** if you sign in with them; they tell us your name, email and identifier, and know that you signed in.
- **Map tiles and pictures.** Your device fetches map pictures straight from Apple (the iPhone's map); from Google (on Android, by itself whenever you zoom the map close in, and on the web where you turn on its layer); from the US Geological Survey (the web's imagery layer, where you turn it on); and, where you show the radar or satellite loop, from Iowa State University's Iowa Environmental Mesonet (the radar) and NOAA's nowCOAST (the satellite). They see your device's internet address and the part of the map you look at, as any map does. On the web, opening an airplane's card on the traffic map asks Planespotters for a photo of it, by that airplane's transponder address; Planespotters sees your browser's internet address and which airplane you looked at.
- **The US Census Bureau,** if you type a street address in Nearest's field: our server asks its geocoder where the address is. Our server keeps the answer in memory for an hour, so the same address is not asked twice, and never writes it to disk or a log; the place you pick stays in the page's address, so it is in your browser history.
- **ADS-B traffic services** (adsb.lol, ADS-B Exchange, adsb.fi). Our server, not your device, asks them for the traffic in an area (its middle rounded to a half-degree square, or a two-degree one zoomed out), for the airplanes the app follows by their transponder address, and for an airplane's route by its callsign. When you search for an airplane in Traffic, what you type (a registration such as your own N-number, a callsign or an address) is sent to adsb.lol, and to ADS-B Exchange where adsb.lol cannot answer. Nothing else of yours goes with it.
- **The FAA, NOAA and the US Geological Survey.** Our servers download the charts, the FAA's data, NOTAMs and the weather, and ask the US Geological Survey the ground's height at points along a route. They see our servers, not you.
- **Our hosting provider** (Amazon Web Services, in the United States), which runs our servers and stores what is above.

Links to ForeFlight, 1800wxbrief.com, the FAA and others open their own sites or apps, under their own policies.

## Your copy and deleting it

- **A copy:** *Export My Data*, in Setup, under your account, downloads everything we keep for your account as one file: your account (with your phone number and home base), airplanes and squawks, saved flights with their nav logs, tracks, share links and flight watches, your logbook, currency, training and instructing, your own checkpoint notes, your reminders and the reminders sent, what you have bought from us if anything, and the AI apps you connected (never their sign-in tokens). Your logbook can also be exported on its own as a CSV file from the Logbook.
- **Deleting:** you can delete an airplane, a flight, a logbook entry or a saved track at any time. *Delete Account*, in Setup, under your account, removes your account and everything above that we keep for it, ends your sign-in on every device and clears the app's settings on the device you use. It cannot be undone. Without the app, or without signing in, go to [wingtipmaps.app/delete-account](/delete-account) and enter the address you sign in with: we email it a link, and the page it opens deletes the same as *Delete Account* once you press Delete Account there.
- **What stays after you delete your account:** an endorsement an instructor signed in the app stays with the other of you two, without your account, because the instructor must keep a record of it for three years (14 CFR 61.189). Fault reports and speed figures carry no account, so they cannot be found to delete; they expire on their own, as above. Copies in your iCloud are deleted from your iCloud settings.

## Children

Wingtip Maps is made for pilots and student pilots, and is not directed to children under 13.

## Changes and contact

When this page changes in a way that matters, the date at the top changes. Questions about your data: the [Support page](/support).

<!-- For the owner: the legal name and postal address of whoever runs Wingtip Maps, and a contact email, go here before launch; the stores ask for both. -->
