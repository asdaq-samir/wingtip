//! The pilot's own records and what the pilot brings in as text: a
//! checklist typed or pasted (checklist), the logbook to and from a CSV
//! file, ForeFlight's export among them (csv, logbook), a handbook's
//! specifications page read off a photo (handbook), and endorsements --
//! which are in force, an instructor's lapsed date, the words signed, the
//! ACS codes of a knowledge test report (endorsements), and AC 61-65K's
//! catalogue of them with its words (kinds) -- and what the
//! logbook says of the pilot: currency under 14 CFR 61.56 and 61.57 and a
//! student's 61.109(a) experience (currency, from the gateway's
//! CurrencyService and TrainingService), and what the records say of
//! endorsements running out, a solo cross-country's 61.93(d) and the
//! airplane's inspections (records, from the gateway's EndorsementRecords
//! and CalendarMonths). The rest moved from the web
//! app's lib/checklist, lib/logbookCsv, lib/handbookText,
//! lib/endorsements and lib/checkride, which the iPhone app copied, so
//! both read a pilot's text alike; `js` holds JavaScript's own reading of
//! text and numbers, which those were first written in.

pub mod calls;
pub mod checklist;
pub mod csv;
pub mod currency;
pub mod due_tone;
pub mod endorsements;
pub mod handbook;
pub mod js;
pub mod kinds;
pub mod logbook;
pub mod logbook_derived;
pub mod records;
