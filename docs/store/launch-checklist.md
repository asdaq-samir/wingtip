# Launch checklist: the owner's account steps

What only the owner can do, in the consoles and accounts the stores and
the domain need, before the first submission to the App Store and Google
Play. Everything else (the code, the docs, the answers to paste) is in
this repository: [listing.md](listing.md) for the listings and the
review notes, [privacy-labels.md](privacy-labels.md) for App Privacy and
Data safety, [preview-video.md](preview-video.md) for the videos, and
[../NATIVE.md](../NATIVE.md) and [../NATIVE-ANDROID.md](../NATIVE-ANDROID.md)
for the builds. From the privacy and store audit of 2026-11-10 (its
owner steps O1 to O6, and the owner's half of B4 to B6, S4 to S6, S12 and
S13). Tick each as it is done.

## Urgent: the multicast networking entitlement

- [ ] **Request it now: Apple takes days to weeks.** On a Wi-Fi-only iPad,
      which has no GPS, the cockpit ADS-B receiver is the only position
      in flight. The receiver is built and parked behind `WingtipReceiver`
      in `apps/ios/project.yml` until the entitlement arrives
      ([../receivers.md](../receivers.md), "The switch", says what to do
      that day). Until then, qualify the listing's receiver line
      (listing.md).

      Sign in as the Account Holder at
      developer.apple.com/contact/request/networking-multicast and
      choose the App ID `app.wingtipmaps.ios`. The form's fields could
      not be read without signing in (2026-11-21), so fit the text below
      to them:

      > **App:** Wingtip Maps, `app.wingtipmaps.ios`, a flight planner
      > and in-flight moving map for general aviation pilots on iPhone
      > and iPad.
      >
      > **Why it needs multicast and broadcast:** Pilots carry a portable
      > ADS-B receiver in the cockpit (Stratux, uAvionix SkyEcho,
      > ForeFlight Sentry). The receiver makes its own Wi-Fi network and
      > sends the aviation industry's GDL 90 protocol (Garmin
      > 560-1058-00) as UDP datagrams to port 4000: the airplane's own
      > GPS position, the traffic around it, and FAA FIS-B weather.
      > Several of these receivers send the datagrams to the network's
      > broadcast address (for example 192.168.10.255), not to each
      > device, so an app without this entitlement never hears them. On
      > a Wi-Fi-only iPad, which has no GPS of its own, the receiver's
      > position is the pilot's only position in flight.
      >
      > **What the app does:** It only listens, on UDP port 4000, on the
      > Wi-Fi network the pilot joined. It never sends multicast or
      > broadcast traffic, opens no other port, and browses no Bonjour
      > services. The bytes are read on the device into the airplane's
      > position, traffic and weather. Nothing heard is sent off the
      > device. Listening starts only when the pilot leaves the setting
      > on, and the Local Network prompt
      > (`NSLocalNetworkUsageDescription`) says why.
      >
      > **Who uses it:** Pilots flying with a receiver in the cockpit
      > with no internet, on every flight. Every major EFB on the App
      > Store works with these receivers.

## The domain and the contact

- [ ] Register `wingtipmaps.app` (and `wingtipmaps.com`), point it at the
      stack (docs/README-AWS.md) and check `/privacy`, `/terms`,
      `/support` and `/delete-account` answer there: both stores need a
      working privacy policy URL, and Play the deletion page.
- [ ] Make a support email address on the domain, and write it into
      `docs/legal/support.md` (the owner's note at its foot) and the
      policy's contact block, with the legal name and postal address of
      whoever runs Wingtip Maps (`docs/legal/privacy.md`, its last note);
      run `scripts/build/legal_pages.py` and commit the pages.
- [ ] Put the same support address in App Store Connect's and Play
      Console's contact fields.

## Apple Developer

- [ ] The App ID `app.wingtipmaps.ios` with its capabilities: Sign in with
      Apple; iCloud with the CloudKit container `iCloud.app.wingtipmaps.ios`;
      Push Notifications; the App Group `group.app.wingtipmaps` (on the
      app and on `app.wingtipmaps.ios.widgets`); Associated Domains;
      Time-Sensitive Notifications.
- [ ] The multicast networking entitlement: **urgent**, see
      [the first section](#urgent-the-multicast-networking-entitlement).
- [ ] Optional: request the Private Cloud Compute entitlement
      (`apps/ios/project.yml`, `WingtipPrivateCloudCompute`).
- [ ] A distribution certificate, and App Store profiles for the app,
      the widgets and the watch app; check the archived app's
      `aps-environment` is `production`
      (`codesign -d --entitlements - <app>`).
- [ ] A Sign in with Apple key, for the gateway to revoke a deleted
      pilot's Apple sign-in (`APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`,
      `AppleRevocation`).

## App Store Connect

- [ ] The app record (bundle `app.wingtipmaps.ios`), categories
      Navigation and Weather, and the fields in listing.md.
- [ ] App Privacy: the answers in privacy-labels.md, including Contact
      Info: Phone Number, Name and User ID (linked) and the saved track as
      linked Precise Location; check them against `PrivacyInfo.xcprivacy`
      first.
- [ ] The age rating, on Apple's new questionnaire (13+, 16+ and 18+
      tiers; answers required since 31 January 2026): answer the
      user-generated content and messaging questions for the
      instructor-student sharing and shared-flight links, the AI questions
      for the on-device and Private Cloud Compute text, and no
      unrestricted web access. Expect 4+, but take it from the answers.
- [ ] Export compliance: `ITSAppUsesNonExemptEncryption` is false (HTTPS
      and CryptoKit hashing only); nothing to upload.
- [ ] App Review information: the notes in listing.md, the demo account
      (the review account's address and code, below), and the screen
      recording of the copilot listening with the phone locked.
- [ ] Screenshots: iPhone 6.9" ×5 and iPad 13" ×2 from
      `docs/store/screenshots/`.

## The review account (both stores)

- [ ] Sign in once with an address used for nothing else (review@ on the
      domain), and give the account an airplane and a saved flight.
- [ ] For each review: `REVIEW_SIGN_IN` true, `REVIEW_SIGN_IN_EMAIL` and
      a fresh `REVIEW_SIGN_IN_CODE` (`openssl rand -base64 24`) in the
      AppSecret (`infra/server/env.example`), deploy.sh, and the address
      and code in both consoles (listing.md, "Review access"). It is off
      by default.
- [ ] After each review: `REVIEW_SIGN_IN` false, deploy again.

## Google Play Console

- [ ] A developer account. A new personal account must run a closed test
      with at least 12 testers who stay opted in for 14 days before it
      can apply for production: start it as soon as a build is signed.
- [ ] Decide the package name for good before the first upload, since
      Play never lets it change: `app.wingtipmaps.android` (it reads
      better) or the build's default `app.wingtipmaps.android.native`
      (`apps/android/app/build.gradle.kts`, `ANDROID_NATIVE_APP_ID`), and
      make listing.md, `APP_ANDROID_PACKAGE` and the Maps key agree.
- [ ] The app record, enrolled in Play App Signing, with an upload key
      kept in CI's secrets for the signed release bundle (`bundleRelease`).
- [ ] Data safety: the answers in privacy-labels.md, with the deletion
      URL `https://wingtipmaps.app/delete-account`; check each Google
      SDK's entry in Play's SDK Index (`play-services-location`, ML Kit's
      document scanner and text recognition) first.
- [ ] Foreground services: a declaration for each of `location`,
      `microphone` and `connectedDevice` (the description, the impact if
      deferred, the use case and a video). preview-video.md's shot list
      covers the copilot and the flight recorder; film the ADS-B
      receiver's setup too.
- [ ] App access: the review account's instructions from listing.md.
- [ ] Content rating (IARC), target audience 18 and over, no ads, and
      the rest of App content as listing.md says.
- [ ] `APP_ANDROID_CERT_SHA256` in the AppSecret with Play's app signing
      certificate and the upload key's, so sign-in links open in the app.

## Google Cloud

- [ ] Restrict the Android Maps key to the package name and the SHA-256
      of Play's **app signing** certificate (not only the upload key):
      the close-in map sends both (`map/CloseMap.kt`), and a key
      restricted to the upload key fails for every installed copy.
- [ ] Map Tiles API billing and a quota for Android's close-in map, which
      now loads by itself whenever the map is zoomed close in.
