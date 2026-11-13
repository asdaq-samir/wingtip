//! wingtip-core: the bottom of the engine's crates (engine/README.md),
//! which every other one may use and which uses none of them: the
//! geodesy and the general readers, no aviation rule.
//!
//! - geo: distances and courses on the WGS-84 ellipsoid, and geo_many:
//!   the same figures over columns of points at once;
//! - wmm: magnetic variation from the World Magnetic Model;
//! - plate: a position on an approach plate's page, by its GeoPDF's
//!   Lambert projection and affine;
//! - grid: route options' straight lines over the grid (sums: the
//!   Python's float sums, kept exactly);
//! - time: UTC dates;
//! - json: the little JSON every rule reads and writes;
//! - sort: the one stable sort every crate's sorting goes through;
//! - text: a whole number with its thousands grouped, "12,500";
//! - units: the SI's exact conversions (the foot, the nautical mile, the
//!   kelvin), one copy;
//! - ask: a rule's input read by its name, for each crate's `call`;
//! - xml: the small XML reader the weather products share.

pub mod ask;
pub mod flat;
pub mod geo;
pub mod geo_many;
pub mod grid;
pub mod json;
pub mod plate;
pub mod sort;
pub mod sums;
pub mod text;
pub mod time;
pub mod units;
pub mod wmm;
pub mod xml;
