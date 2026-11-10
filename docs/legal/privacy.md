# Privacy policy

*Draft for the owner to review. Checked against the code on 9 November 2026, and for the features Claude writes on 10 November 2026; not yet in effect.*

Wingtip Maps is a flight planner for VFR and IFR flight, on the web, the iPhone and Android. This page says what the app keeps about you, where it keeps it, what leaves your device and who receives it. It describes what the app does today; where it says "we", it means the people who run Wingtip Maps.

You can use the map and plan a route without an account. Most of what follows is about the account you may make, and about the features that send something off your device to work.

## What we keep for your account

When you sign in, our server keeps, in its database:

- **Who you are:** your email address and the name you sign in with; if you sign in with Google or Apple, the identifier that provider gives us for you, and for Apple the token that lets us end that sign-in when you delete your account. We hold no password: there is none.
- **Your sign-in:** a session that keeps you signed in until you have not used the app for 30 days. The link we email you to sign in is kept only as a one-way hash, works once, and lasts 15 minutes.
- **What you give the app:** your telephone number and home base, if you add them; your name as on your pilot certificate, if you give it for endorsements; your medical, flight review and instrument proficiency check dates and your knowledge test codes; and, if you instruct, your flight instructor certificate number and its date.
- **What you save:** your airplanes (tail number, type, performance figures, inspections and checks, due items and squawks), your saved flights with their nav logs and risk assessments, your logbook, your endorsements, the approaches an instructor sets you as lessons, and the checkpoint notes you write for yourself.
- **Flown tracks**, as GPS points, only when you choose to save one to a flight.
- **Your instructor and students:** the instructors you ask in by address, the saved flights you put to them, and the endorsements signed in the app between you.
- **Flights you share:** when you share a saved flight, a random link to it, whether its N-number goes with it, and when you shared it. Anyone with the link can read the flight's route, stops, altitudes, departure time, airplane type and nav log, but never your name, email, notes or risk assessment, and the N-number only if you choose to include it. Stop Sharing in the flight's menu ends the link for everyone; deleting the flight or your account does too. A plan you share as a plain link is carried in the link itself and is not stored by us.
- **Flight watch:** for a saved flight you ask us to watch, its departure time and the last briefing we checked it against, so we can email you when the weather or NOTAMs on it change.
- **Reminders:** whether you want email before your currency or an airplane's due item runs out, and which reminders we have sent.
- **The features Claude writes:** a count, each month, of how many times you used each of them, for its monthly allowance. While those features are off, as they are now, there is nothing to count.

We keep these until you delete them or delete your account. We do not sell them, share them for advertising, or use them to track you across other companies' apps or sites.

## What stays on your device

The app keeps your settings, personal minimums, checklists, the charts and data you keep for flying without a connection, your recent flown tracks and your last known position on your device. The web app keeps them in your browser's storage; the iPhone and Android apps in their own storage. None of it is sent to us unless this page says so.

If you connect the iPhone or Android app to an ADS-B receiver in the cockpit, the traffic and weather it hears over the cockpit's Wi-Fi are read and shown on your device only; nothing of it is sent anywhere, and it is not kept past a few hours.

On the iPhone, the airplanes you keep or watch on the map and your planned routes are also kept in your own iCloud account, if iCloud is on for the app, so your other Apple devices have them. They go to Apple, not to us; we cannot read them. An Apple Watch paired with your iPhone receives the airplane, checklist and position the watch app shows.

## Your location

The app asks your device for your position only after you turn on the location arrow (or start flying, on a phone) and your device allows it. On the iPhone it keeps reading your position while the app is in the background only while you are flying, so the flight can be followed; on Android a notification shows while it does.

Your position is used on your device to draw your airplane and measure from it. It leaves your device when a feature needs it to answer:

- **to our planner,** to find the nearest airports, the airspace and alerts around and ahead of you, nearby traffic and emergency fields. The planner answers and does not keep it. It does keep, for 60 seconds and without anything that says whose it is, the area of the map in view (rounded to about 6 nautical miles), to fetch traffic there.
- **to Claude,** when you use Ask while your position is known, and only while the features Claude writes are on; they are off now (see below).

Your position is stored with your account only as a track you choose to save to a flight.

## Listening to the radio

When you turn on the ATC copilot, or speak to the app, it listens through your device's microphone and turns the speech into text, to show the calls addressed to you. The app records no audio, saves none to a file, and sends none to us.

- **In the iPhone and Android apps, speech is recognised on your phone and never leaves it.** They use only the recognizer that runs on the phone itself: Apple's on-device speech recognition on the iPhone, and the phone's on-device speech recognizer on Android (Android 12 and later). Where a phone cannot do that, the app does not offer voice, and you type instead; it never falls back to a recognizer on someone's servers.
- **In a web browser, the app uses the browser's own speech recognition.** Where the browser can promise that the audio stays on your computer or phone (Chrome, which may first download its English language pack), the app asks it to. Other browsers, such as Safari, may send the audio to their maker (Apple, for Safari) to be recognised, under that company's privacy policy. A browser with no speech recognition (Firefox) is not offered voice. Of the text, only the place names in a clearance you heard (a clearance limit, a route, a departure) go to our planner, to find them on the map; a question you ask aloud is treated as a typed question is: while the features Claude writes are off, as now, it is not sent to Claude.

## Siri and the camera on iPhone

On an iPhone, Siri can act on what the app shows: the airports, waypoints, NOTAMs, approaches, frequencies, airplanes and logbook entries on the screen, and your flight. The app tells the phone which of these is on the screen so Siri knows what "this airport" means; that stays between the app and your iPhone under Apple's privacy policy for Siri, and nothing more is sent to us than when you tap the same thing.

When you point the iPhone's camera at a chart, a plate, a weather printout or a sign and ask Siri about it, the picture is read on your phone. Only the airport identifiers found in it go to our planner, to find those airports; the picture is not sent to us.

## Features Claude writes

**These features are off for now, and Anthropic receives nothing from the app or from us.** Where your phone has its own model (Apple Intelligence on an iPhone, Gemini Nano on Android) some of them are written on the phone instead, as below; the rest are not offered, and the app shows its own figures and words. If we turn them on later, this page will say so first, and what Anthropic would then receive is listed here.

Some features can be written by Claude, an AI model made by Anthropic: Ask and its trip planner, the written briefing, the words beside the Brief's figures (the NOTAMs, the weather and the risk), the debrief's and the Coach's words, checkpoint descriptions, the mock oral, a photographed page read, and flight watch's email. To write them, our server would send Anthropic:

- **Ask:** your conversation (what you typed or said and the answers so far), the route and stops, the airplane, the cruising altitude and departure time, your personal minimums, your currency and your home base, and, when the app knows it, your airplane's position (to about 100 metres), altitude, track and groundspeed; and the answers our planner gives it as it works.
- **The trip planner:** what you asked for in words, with the same plan and position as Ask.
- **The written briefing and the Brief's words:** the route's identifiers, the airplane's type, the altitude, each leg's figures, the weather and NOTAM text on the route, and, for the risk words, the Go / No-Go's findings with your minimums and currency.
- **The debrief's words:** a flown flight's figures (its time in the air, each leg's altitude and course held, its checkpoint times and pattern entries) and your notes on it.
- **The Coach's words:** the practice plan the app worked out from your logbook (what is current, and what is due when).
- **Checkpoint descriptions:** the checkpoint and the checkpoints around it.
- **The mock oral:** the flight's plan as text and the answers you type.
- **Flight watch:** what changed on a watched flight's route.
- **A page you photograph** (a handbook page, a logbook page, a clearance you wrote down), to read its figures for you to check: the photo and today's date, only where your phone cannot read it itself (below; an iPhone with Apple Intelligence on iOS 27 reads it on the phone). It is not kept.

We do not send your name, email address or account to Anthropic. We do not keep your Ask conversations: each one stays on your device. Anthropic receives this as our service provider and handles it under its commercial terms. What Claude writes can be wrong; the app says so where it shows it.

Some phones write a few of these on the device instead, with Apple's own on-device model, where the iPhone has one; nothing is sent for those. On an iPhone with Apple Intelligence, the NOTAMs in plain words and what a NOTAM means for your flight, a drafted logbook remark, a clearance said in full and why your plan flies its altitude are written by Apple's models, and a photographed page is read on the phone first (iOS 27).

Where the iPhone's own model cannot do one of these (it is still downloading, it cannot see a photo, or its answer did not pass our checks), the app may ask Apple's Private Cloud Compute instead, before it would ask Claude: Apple's larger model on Apple's servers, which Apple designs so that what is sent is used only to answer and is never stored, and which neither we nor Anthropic receive. What goes there is what that feature needs: the NOTAMs and why each matters, the logbook entry's columns and what the app found in your track, the clearance's words, the reasons for your altitude, your question to Ask with the figures the app worked out for it, the Go / No-Go's findings, or the photographed page. Apple counts it against your iCloud account's daily allowance. Claude would be asked after that only for a page neither of Apple's models can read, for Ask when it needs our planner's look-ups, and for the Brief's weather and risk words, as above, and only while those features are on.

On an Android phone that has Google's Gemini Nano (through Android's AICore; Setup's On-Phone AI says whether yours does), the app does these on the phone first and sends nothing to Anthropic for them: Ask, the words beside the Brief, an airport's weather, the route's NOTAMs, the nav log and the Coach's debriefs, a drafted logbook remark, and the reading of a photographed page (its text is read by Google's on-device text recognition, then by Gemini Nano). Ask's look-ups still ask our planner for the airport, the route or the NOTAMs, as the screens do. Where the phone has no Gemini Nano, these are not offered while the features Claude writes are off, as now; with them on, they would come from Claude as above, signed in only.

## Assistants on your phone

On Android 16 and later, Google's Gemini and other assistants on your phone that Android allows can ask Wingtip Maps for an airport's card, its frequencies and approaches, the nearest airports, your planned route and its NOTAMs, the Brief's verdict, and your airplanes and logbook entries, and can open the app on a route, an airport or a screen. The app answers on your phone, only when you ask the assistant; what the assistant then does with the answer is under its maker's privacy policy (Google's, for Gemini). When you ask an assistant about what is on your screen, the app gives it the route you have planned, as a link. The app's shortcuts (a long press on its icon) open its screens and send nothing.

## Faults and speed

So we hear when the app breaks without you having to write in, each app sends us a report when something goes wrong:

- **the web app:** an error nobody caught, with its message and where in the app's code it happened;
- **the iPhone app:** the crash, hang and exception reports Apple's MetricKit gives the app, and its daily launch time, hang time, scrolling smoothness, most memory used and how often the system closed it for using too much;
- **the Android app:** why the app last stopped when the system stopped it (a crash, an app not responding, low memory), a crash's stack trace, and how long it took to start and how many frames were slow.

Each report carries the app's version, the system's version and whether the device is a phone, tablet or computer. It carries nothing of yours: no account, no address, no route, no position. Our server takes out any web address's query, any email address, any user name in a folder's path and any per-install identifier before keeping it. Faults are kept 30 days.

The web app also sends, when you leave a page, how fast it was on your device (Google's Core Web Vitals and how long the browser was busy), with the page's name, the kind of device and the app's version, nothing else. Speed figures from all three apps are kept 400 days, to see whether the app is getting faster or slower.

There is no analytics or advertising kit in any of the apps, and no third party receives these reports.

## Who else receives anything

- **Anthropic,** nothing while the features Claude writes are off, as they are now; with them on, what is listed above.
- **Apple,** on an iPhone, for the features its Private Cloud Compute writes where the phone's own model cannot, as above; Apple uses it only to answer and does not keep it.
- **Our email sender** (Amazon SES), which delivers the email we send: your sign-in link, the reminders you turn on, flight watch's changes, and the email between you and an instructor you ask in.
- **Your instructor or student,** once you ask them in: your name and address, the experience and endorsements in your logbook, your knowledge test codes, and the saved flights you put to them. Either of you can end it.
- **Google and Apple,** if you sign in with them; they tell us your name, email and identifier, and know that you signed in.
- **Map tiles.** Your device fetches map pictures straight from Apple (the iPhone's map), from Google (Android's close-in map, and the web's Google layer where you turn it on) and from the US Geological Survey (the web's imagery layer, where you turn it on). They see your device's internet address and the part of the map you look at, as any map does.
- **The US Census Bureau,** if you type a street address in Nearest's field: our server asks its geocoder where the address is. We do not keep it, but the place you pick stays in the page's address, so it is in your browser history.
- **ADS-B traffic services** (adsb.lol, ADS-B Exchange, adsb.fi). Our server, not your device, asks them for the traffic in an area (its middle rounded to half a degree) and for the airplanes the app follows, by their transponder address. Nothing of yours goes with it.
- **The FAA and NOAA.** Our servers download the charts, the FAA's data, NOTAMs and the weather. They see our servers, not you.
- **Our hosting provider** (Amazon Web Services, in the United States), which runs our servers and stores what is above.

Links to ForeFlight, 1800wxbrief.com, the FAA and others open their own sites or apps, under their own policies.

## Your copy and deleting it

- **A copy:** *Export My Data*, in Setup, under your account, downloads everything we keep for your account as one file. Your logbook can also be exported on its own as a CSV file from the Logbook.
- **Deleting:** you can delete an airplane, a flight, a logbook entry or a saved track at any time. *Delete Account*, in Setup, under your account, removes your account and everything above that we keep for it, ends your sign-in on every device and clears the app's settings on the device you use. It cannot be undone.
- **What stays after you delete your account:** an endorsement an instructor signed in the app stays with the other of you two, without your account, because the instructor must keep a record of it for three years (14 CFR 61.189). Fault reports and speed figures carry no account, so they cannot be found to delete; they expire on their own, as above. Copies in your iCloud are deleted from your iCloud settings.

## Children

Wingtip Maps is made for pilots and student pilots, and is not directed to children under 13.

## Changes and contact

When this page changes in a way that matters, the date at the top changes. Questions about your data: the [Support page](/support).

<!-- For the owner: the legal name and postal address of whoever runs Wingtip Maps, and a contact email, go here before launch; the stores ask for both. -->
