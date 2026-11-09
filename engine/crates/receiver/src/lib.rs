//! wingtip-receiver: a portable ADS-B receiver on the cockpit's Wi-Fi
//! (Stratux, Sentry, Garmin's GDL 39 and GDL 52, uAvionix's), read from
//! the GDL 90 it sends to UDP port 4000, over wingtip-core only
//! (engine/README.md). The phones listen and hand the bytes over; every
//! figure is read here.
//!
//! - frame: GDL 90's frames, their escapes and their CRC-CCITT;
//! - message: the messages by ID (Heartbeat, Ownship, Ownship Geometric
//!   Altitude, Traffic Report, Uplink Data, ForeFlight's ID message);
//! - report: the Ownship and Traffic Reports' 27 bytes;
//! - uplink: a UAT ground station's uplink and its FIS-B APDUs;
//! - dlac: FIS-B's 6-bit text;
//! - fisb: FIS-B's text products and NEXRAD out of their APDUs;
//! - nexrad: NEXRAD's blocks, where each is and its bins;
//! - picture, picture_json: what the receiver has said so far, carried
//!   by the host from one read to the next;
//! - views: the traffic to draw merged with the internet's, a field's
//!   METAR and TAF, the NEXRAD as rectangles;
//! - calls: the rules by name.
//!
//! ADS-B In traffic "is NOT intended to be used as a collision avoidance
//! system and does not relieve the pilot's responsibility to 'see and
//! avoid'" (AIM 4-5-7), and FIS-B "should not be the only source of
//! weather or aeronautical information" (AIM 4-5-9).

pub mod calls;
pub mod dlac;
pub mod fisb;
pub mod frame;
pub mod message;
pub mod nexrad;
pub mod picture;
pub mod picture_json;
pub mod report;
pub mod uplink;
pub mod views;
