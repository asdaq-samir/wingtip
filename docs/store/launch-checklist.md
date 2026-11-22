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

## The order

Each step needs the one before it:

1. **The backend.** The AWS stack (docs/README-AWS.md, "The first
   deploy"; issue #115) and the domain below. Every build, the beta's
   too, talks to `WINGTIP_URL`'s host, and both stores' reviewers sign
   in there.
2. **The organization accounts.** The D-U-N-S number takes days, and
   Apple's and Play's organization enrolments wait on it (below).
3. **The pilot beta** ([beta.md](beta.md)): TestFlight external testing
   and Play internal testing, about four weeks.
4. **The listings and forms** below, then the review account switched
   on, then submit.

## The backend

- [ ] The stack, its images, mail and first chart cycle, as
      docs/README-AWS.md's "The first deploy" (its owner's steps are
      issue #115's: the AWS account with MFA, the Route 53 zone, the
      GitHub `production` environment, the AppSecret).
- [ ] SES production access (README-AWS, "Mail", step 4). Until Amazon
      grants it, the emailed sign-in link reaches only verified
      addresses: no tester or reviewer could sign in by email.
- [ ] The server's size: `InstanceType` t3a.large, not the template's
      t3a.medium default. The services take about 3.5 GB of the
      medium's 4 GB (the prelaunch audit of 2026-11-21).
- [ ] A restore rehearsed once (README-AWS, "Backups and restore"). Then
      delete again any account deleted since the backup restored: a
      restore brings deleted accounts back, and nothing yet does it by
      itself (the prelaunch audit's P3).

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

## The FAA's full NOTAM set (NMS-API)

- [ ] Ask the FAA for NOTAM Management Service API access now: it is
      granted by mail, not at once (decision 0059). Write to the NOTAM
      Service Center, **7-AWA-NAIMES@faa.gov**, copying
      **NOTAMS@faa.gov**, from the support address. The text to send,
      what it asks for (staging and production credentials, the API's
      document and rate limits, the terms for showing NOTAMs in a public
      app, FNS's retirement date) and what to do with the answer are in
      [../partners/faa-nms-api.md](../partners/faa-nms-api.md).
- [ ] When the credentials come, put `NMS_API_CLIENT_ID` and
      `NMS_API_CLIENT_SECRET` in the server's secret. Until then the app
      says "NOTAMs heard since <date>, not a full set", Ready to Fly
      counts that as a caution, and the listing says "recent NOTAMs".

## Apple Developer

- [ ] Enroll as an organization (a legal entity with a D-U-N-S number),
      not as an individual, and use the same entity on Google Play.
      App Review 5.1.1(ix) asks that apps in highly regulated fields,
      "air travel" among them, be submitted by a legal entity, and the
      seller name both stores show is the one the policy and terms name
      as who offers the app (docs/legal/privacy.md's and terms.md's
      notes). An individual account can be migrated to an organization
      later, but not quickly: start it first (the store-review audit,
      2026-11-21).
- [ ] The App ID `app.wingtipmaps.ios` with its capabilities: Sign in with
      Apple; iCloud with the CloudKit container `iCloud.app.wingtipmaps.ios`;
      Push Notifications; the App Group `group.app.wingtipmaps` (on the
      app and on `app.wingtipmaps.ios.widgets`); Associated Domains;
      Time-Sensitive Notifications.
- [ ] Request the multicast networking entitlement
      (`com.apple.developer.networking.multicast`) for the cockpit ADS-B
      receiver: Stratux and SkyEcho broadcast GDL 90, which the app hears
      only with it (`Receiver/ReceiverListener.swift`). Until Apple grants
      it, qualify the listing's receiver line (listing.md).
- [ ] Sign in with Apple for Email Communication (Certificates,
      Identifiers & Profiles, Services): register `wingtipmaps.app` and
      the sending address (`MAIL_FROM`, `no-reply@wingtipmaps.app`), with
      the domain's SPF and DKIM passing. A pilot who signs in with Hide My
      Email has a `privaterelay.appleid.com` address, and Apple's relay
      drops mail from an unregistered sender: their sign-in links,
      reminders and instructor mail would never arrive (the store-review
      audit, 2026-11-21).
- [ ] Optional: request the Private Cloud Compute entitlement
      (`apps/ios/project.yml`, `WingtipPrivateCloudCompute`).
- [ ] A distribution certificate, and App Store profiles for the app,
      the widgets and the watch app; check the archived app's
      `aps-environment` is `production`
      (`codesign -d --entitlements - <app>`).
- [ ] A Sign in with Apple key, for the gateway to revoke a deleted
      pilot's Apple sign-in (`APPLE_TEAM_ID`, `APPLE_KEY_ID`,
      `APPLE_PRIVATE_KEY`, `AppleRevocation`), with `app.wingtipmaps.ios`
      as its primary App ID and the web's Services ID grouped under it:
      the same key signs the iPhone's client secret, which trades the
      app's authorization code for the token deleting the account
      revokes (`AppleAppTokens`, docs/NATIVE.md, "Sign in with Apple:
      revoked when the account goes"). Set `APP_IOS_BUNDLE_ID` on the
      gateway too. After the first review build, sign in on an iPhone,
      delete the account, and check the app has left Settings, Apple
      Account, Sign in with Apple.

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
      `docs/store/screenshots/`, and at least one Apple Watch screenshot,
      which App Store Connect asks of an app that has a Watch app (the
      shot list is in `screenshots/README.md`, "Still to take"; not yet
      captured).

## Data the apps show under someone else's terms

App Review 5.2.2 asks that an app showing a third-party service's
content be "specifically permitted to do so under the service's terms of
use", with the authorization given on request; Play's Intellectual
Property policy asks the same. Two of the traffic sources credited in
About (docs/legal/credits.md) carry non-commercial terms:

- [ ] adsb.fi: "Personal, non-commercial use, credited and linked".
      Ask adsb.fi in writing for use in an app distributed on the App
      Store and Google Play, or turn the source off for the store builds
      (the planner's traffic sources, docs/privacy-inventory.md).
- [ ] ADS-B Exchange (RapidAPI): check that the plan the key is on allows
      a published app, or ask ADS-B Exchange for a licence.
- [ ] Keep each answer where a reviewer's request can be met at once.

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
- [ ] Phone screenshots, at least two (Play needs two to publish):
      `screenshots/android-phone/`, not yet captured (screenshots/README.md,
      "Still to take").
- [ ] Content rating (IARC), target audience 18 and over, no ads, and
      the rest of App content as listing.md says.
- [ ] `APP_ANDROID_CERT_SHA256` in the AppSecret with Play's app signing
      certificate and the upload key's, so sign-in links open in the app.

## Not yet anyone's step

Found missing in the launch path on 2026-11-21. Each is code or a
decision, not a console step:

- [ ] A re-deletion after a restore (the prelaunch audit's P3): a
      `deleted_accounts` log kept outside the dump, read after any
      restore.
- [ ] An open-source licence screen in the phones' About (Apache-2.0
      notices; the store-review audit's 14). No store rule asks for it,
      but the licences do.
- [ ] A privacy contact address named in the policy, once the domain's
      mailbox exists (the prelaunch audit, "For the owner").
- [ ] The beta's outcome folded into the feature review
      ([feature-review.md](feature-review.md)) before the listing's
      words are final: a feature cut or parked leaves the listing and
      the screenshots too.

## Google Cloud

Nothing for Android: its close-in map is the USGS's imagery
(`map/CloseMap.kt`), and the app carries no Maps key. The web's Google
overlay keeps the planner's browser key (docs/GOOGLE-MAPS.md).
