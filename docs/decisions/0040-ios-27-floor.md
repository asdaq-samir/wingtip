# 0040. The iPhone app's oldest iOS is 27, and the Watch's watchOS 27

- **Date:** 2026-11-12
- **Status:** Accepted

## Context

The app's floors were iOS 18.0 and watchOS 10.0. The owner's rule is the
newest of everything while nothing is launched (memory: "Stock code over
hand-rolled", "Break freely until launch"): no fallback kept for an
older system nobody runs it on yet. The floors were first raised to 26
(caad6a638), and the owner asked: "Why did you move to 26 and not 27?"
This page weighs the floors that were open, and what each costs in
devices. The device lists are Apple's, as docs/NATIVE.md and
docs/versions.md give them.

## Options

| Option | For | Against |
|---|---|---|
| **A. iOS 18 and watchOS 10** (as was) | The most devices: iPhone XS, XS Max and XR, Apple Watch Series 4, 5 and the first SE. | Every newer API behind `#available`: the material fallbacks beside Liquid Glass, FoundationModels behind `canImport`, the App Intents commands handed over by `AppCommands` and `AppOpener` for the iOS without `TargetContentProvidingIntent`. Two ways of doing each thing, the older one rarely seen and so untested. |
| **B. iOS 26 and watchOS 26** | Drops the App Intents fallback and the glass fallbacks: Liquid Glass and FoundationModels are always there. Loses only the iPhone XS, XS Max and XR. | iOS 27's own parts still behind `#available`: Private Cloud Compute and image reading, the pinned bar item and the bar that folds on scroll, `submitTaskRequest`, the new `installTap`, Siri's entity ids on notifications. A second, smaller set of fallbacks to keep. |
| **C. iOS 27 and watchOS 27** (chosen) | No fallback at all: every API used as it comes, nothing behind `#available`. The same iPhones as 26 (iOS 27.2 runs on iPhone 11 and later and SE 2 and 3), and iPadOS 27.2 on iPad 9 and later, mini 6, Air 4, Pro 11-inch 2 and 12.9-inch 4 and later. | watchOS 27 needs Apple Watch Series 9 or later, SE 3 or Ultra 2 and later: Series 6, 7 and 8, SE 2 and the first Ultra can no longer install the Watch app. Three APIs the 27 floor deprecates had to be replaced (warnings are errors). |
| **D. iOS 27, the Watch on watchOS 26** | Keeps the Series 6 to 8, SE 2 and first Ultra. | Two floors to keep in step; the Watch's code keeps `#available` for 27 where it uses anything new; the Watch app is small (timers, checklist, nearest) and gains little from 27, so the split buys devices at the cost of the rule. |

## Decision

C: iOS 27.0 and watchOS 27.0 (0bbb6105f). Moving to 27 rather than 26
costs no iPhone, and it is the only floor with no fallback left, which is
the owner's rule. The Watch's cost is real (watches up to three years
old), and is accepted while nothing is launched; if pilots with an older
watch matter at launch, D is the way back and changes only the Watch
target's floor.

## Consequences

- `apps/ios/project.yml`'s `deploymentTarget` is iOS 27.0 and watchOS
  26.0 since the amendment below; nothing in the app is behind `#available`.
- Each new major iOS raises the question again: before launch, the floor
  follows the newest; after it, a decision record weighs who is lost.
- docs/NATIVE.md, docs/versions.md and docs/ios-27.md say the floors.

## Amendment, 2026-11-12: the Watch stays on watchOS 26

The owner kept the Watch on watchOS 26 until launch (option D for the
Watch alone): watchOS 27 drops Apple Watch Series 6, 7 and 8, SE (2nd
generation) and the first Ultra, which watchOS 26 runs on. The iPhone app
and its widgets stay on iOS 27. The Watch app used no watchOS 27 API, so
nothing went behind `#available`; `apps/ios/project.yml`'s watchOS
`deploymentTarget` is 26.0.

## Source

The owner's question, 2026-11-12: "Why did you move to 26 and not 27?";
the commits caad6a638 (26) and 0bbb6105f (27), with Apple's device lists.
