# The pilot beta: TestFlight and Play internal testing

The owner's plan of 2026-11-21: 5 to 10 pilots, a CFI and an IFR pilot
among them, on TestFlight's external testing and Google Play's internal
testing, right after the wave of that day merges. They test for about
four weeks before the first store submission. This page has the build's
part (done in the repository), the steps only the owner can do, in
order, and what to watch. The launch itself stays
[launch-checklist.md](launch-checklist.md).

## What the repository does

| | iPhone (TestFlight) | Android (Play internal testing) |
|---|---|---|
| When | Every push to `main` that changes the app, or Run workflow on Native iOS (`native-ios.yml`, `testflight`) | Every push to `main` that changes the app (`native-android.yml`; the night builds the bundle but sends none) |
| Build | Archived, signed and uploaded (`scripts/ci/ios_testflight.sh`), build number the run's | Signed release bundle (`scripts/ci/android_build.sh`), version code the run's number (`ANDROID_VERSION_CODE`, new: Play refuses a code it has had) |
| To the testers | `scripts/ci/testflight_beta.py`: waits for Apple's processing (20 minutes at most), sets What to Test, adds the build to the group **Pilots**, and asks for Beta App Review | `scripts/ci/play_internal.py`: uploads the bundle and R8's mapping, puts it on the **internal** track with the notes, and commits |
| Notes | [beta/what-to-test.txt](beta/what-to-test.txt) (4,000 characters at most) | [beta/release-notes.txt](beta/release-notes.txt) (500 at most) |
| Needs | The App Store Connect key (docs/NATIVE.md, "What only the owner can do, for TestFlight") | The upload key (docs/NATIVE-ANDROID.md, "Releasing to Google Play") and the `PLAY_SERVICE_ACCOUNT` secret (below) |
| Without it | A missing group or a slow processing is a notice: add the build by hand | No secret: the bundle is kept as the run's artifact, as before |

Feedback: **Send Feedback** in About on both phones hands the share sheet
the app's version and build, the system's version and three questions
("What I was doing", "What happened", "What I expected"). The tester
sends it by their own mail or message. The app sends and keeps nothing
new (docs/privacy-inventory.md, "Data that leaves the device but is not
collected"). On the iPhone, TestFlight's own screenshot feedback
(Share Beta Feedback) comes to App Store Connect too. The fault and
speed reports keep coming as they do for everyone (Diagnostics, 30 and
400 days).

The tester invitation, to send from the owner's own address:
[beta/invitation.md](beta/invitation.md).

## What only the owner can do, in order

### 1. The backend the testers reach

The beta's builds talk to `WINGTIP_URL`'s host (`wingtipmaps.app` unless
the repository variable says otherwise), so it must be live first:

- [ ] The AWS stack, its images, mail and first chart cycle
      (docs/README-AWS.md, "The first deploy"; issue #115), with SES out
      of the sandbox: until then the emailed sign-in link reaches only
      verified addresses, so a tester could not sign in by email.
- [ ] The instance size: t3a.large at launch, against the template's
      t3a.medium default (the prelaunch audit's 3.5 GB of services on a
      4 GB server).
- [ ] The domain's `/privacy`, `/terms`, `/support` and `/delete-account`
      answering. TestFlight's Test Information asks for the privacy
      policy's address.

### 2. App Store Connect (TestFlight external testing)

- [ ] The app record and the App Store Connect key, as docs/NATIVE.md's
      "What only the owner can do, for TestFlight" steps 1 to 6.
- [ ] TestFlight, Test Information:
      - the beta description (the first paragraph of listing.md's
        description);
      - the feedback email (the owner's);
      - the privacy policy URL;
      - the Beta App Review contact;
      - the sign-in information: the review account, as
        listing.md's "Review access" says, with `REVIEW_SIGN_IN` on for
        the review.
- [ ] TestFlight, External Testing, **+** a group named exactly
      **Pilots** (`BETA_GROUP` in testflight_beta.py). Add each tester
      by email, or turn on its public link with a limit of 10 testers.
- [ ] The first build of each version waits for Beta App Review (about a
      day). Later builds of the same version usually need none. Check
      the build shows "Ready to Test" in the group.
- [ ] Add yourself to an internal group too, to see each build before
      the pilots do.

### 3. Play Console (internal testing)

- [ ] The developer account. As an organization (launch-checklist.md,
      "Apple Developer", the D-U-N-S step). A new personal account must
      also run a closed test of at least 12 testers for 14 days before
      production, and a 5 to 10 pilot beta is fewer than that.
- [ ] Decide the package name for good before the first upload
      (launch-checklist.md, "Google Play Console"). The workflow uses
      `ANDROID_NATIVE_APP_ID`, `app.wingtipmaps.android.native` by default.
      Set the repository variable and the workflow env if it changes.
- [ ] Create the app, then upload the **first** bundle by hand to
      Testing, Internal testing (the `wingtip-native-release` artifact of
      a `main` run). Play takes no API upload before that, and lets
      Google make the app-signing key (Play App Signing).
- [ ] Testing, Internal testing, Testers: an email list named **Pilots**
      with each tester's Google account address. Copy the opt-in link
      for the invitation.
- [ ] The API: in Google Cloud, a project with the Google Play Android
      Developer API on, and a service account with a JSON key. In Play
      Console, Users and permissions, invite the service account's email
      with "Release to testing tracks" for this app. Put the JSON in the
      repository secret `PLAY_SERVICE_ACCOUNT`.
- [ ] While the app is still a draft in Play Console, Play takes only
      draft releases. Either publish the first internal release by hand
      once, or set `PLAY_RELEASE_STATUS=draft` and roll each one out by
      hand.
- [ ] Play may ask for App content (the privacy policy, Data safety, the
      ads and target audience questions) before the first internal
      release. The answers are in privacy-labels.md and listing.md.

### 4. The testers

- [ ] Pick 5 to 10 pilots: at least one CFI and one instrument-rated
      pilot. Each tester needs an iPhone or an Android phone; ask which.
- [ ] Send each the invitation ([beta/invitation.md](beta/invitation.md)),
      then add them to the store's group.
- [ ] A shared place for what they send: a folder in the mail, or one
      `ready` issue per finding (one write at a time, as the ship skill
      says). Never a tester's email in a public issue.

## While the beta runs

- A wrong figure is fixed first (CLAUDE.md, Aviation), with its source.
- Each fix lands through the usual wave, then `main`'s push sends the
  next build to both groups with the notes as they stand. Update
  what-to-test.txt and release-notes.txt in the same branch when what
  to try changes.
- At the end: what the pilots used and never touched feeds
  [feature-review.md](feature-review.md)'s keep, park or cut.

## Not part of the beta

- The App Store and Play production submissions
  ([launch-checklist.md](launch-checklist.md)).
- The web: pilots can use it as it is, under the same planning-aid words.
