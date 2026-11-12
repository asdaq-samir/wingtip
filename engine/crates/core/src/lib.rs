//! wingtip-core: the bottom of the engine's crates (engine/README.md),
//! which every other one may use and which uses none of them: the
//! geodesy and the general readers, no aviation rule.
//!
//! - base64: bytes carried in JSON (RFC 4648), as a receiver's are;
//! - geo: great-circle distances, as wingtip.geo has them;
//! - wmm: magnetic variation from the World Magnetic Model;
//! - grid: route options' straight lines over the grid (sums: the
//!   Python's float sums, kept exactly);
//! - time: UTC dates;
//! - json: the little JSON every rule reads and writes;
//! - sort: the one stable sort every crate's sorting goes through;
//! - text: a whole number with its thousands grouped, "12,500";
//! - xml: the small XML reader the weather products share.

pub mod base64;
pub mod geo;
pub mod grid;
pub mod json;
pub mod sort;
pub mod sums;
pub mod text;
pub mod time;
pub mod wmm;
pub mod xml;
