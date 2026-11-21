# 0055. The store apps name an airplane's registrant only where it is the pilot's own or an organisation

- **Date:** 2026-11-21
- **Status:** Accepted (the owner, 2026-11-21: "Do everything you can do",
  on the store-review audit's recommendation)
- **Amends:** the owner's choice of 2026-11-14 ("For owner info though,
  it's public info"), for the iPhone and Android apps only

## Context

The airplane card's Info, its facts strip and a tracked airplane's FAA
section showed the FAA registry's owner, co-owners and town for any
N-number, traffic in the air included. App Review guideline 5.1.1(viii)
says: "Apps that compile personal information from any source that is
not directly from the user or without the user's explicit consent, even
public databases, are not permitted." A private owner's name next to
where their airplane is flying now is that, and the store-review audit
of 2026-11-21 ranked it a high rejection risk (its finding 2).

## Decision

1. **On the iPhone and Android**, an airplane card names the registrant
   and co-owners only when:
   - the airplane is one of the pilot's own (iPhone: the account's
     airplanes; Android: the airplane's record, on the phone or the
     account); or
   - the FAA types the registrant as an organisation. Type Registrant
     (MASTER and DEREG; the registry's readme, ardata.pdf;
     `wingtip/registry_codes.py`): 3 Corporation, 5 Government, 7 LLC,
     8 Non-citizen corporation.
2. **Anyone else is their kind and state**: "Individual, WI". No name, no
   town, no co-owners' names (their count stays). 1 Individual, 4
   Co-owned and 9 Non-citizen co-owned are people. A 2 Partnership is
   most often two people by name, so it is treated as people too. A
   missing kind is "Private owner".
3. **Past registrations** name only organisations, since a past owner of
   the pilot's airplane is someone else. **A reservation** of the N-number
   names who reserved it only on the pilot's own airplane, since the
   registry gives no kind for them.
4. **The web keeps every name**, the owner's choice of 2026-11-14: it is
   not on the App Store. The planner still sends the whole record. The
   store apps choose what to draw.

It is a display rule of the stores', not an aviation rule, so each app
keeps it (`RegistryNames` on both phones, with its tests), not the
engine.

## Consequences

- A reviewer who taps traffic or searches an N-number sees no private
  person's name.
- A pilot sees their own airplane's record in full, and a flying club's,
  a school's or a charter company's name as before.
- If the web is ever wrapped or listed in a store, this rule applies to
  it too.
