//! FIS-B's NEXRAD (products 63, regional, and 64, CONUS: DO-358B's
//! "Global Block Representation"): the world cut into blocks 48 minutes of
//! longitude wide and 4 minutes of latitude high, 450 to a ring below 60
//! degrees, each block 32 bins across and 4 down, each bin a level 0 to 7.
//! A block is sent run-length coded, or as a list of blocks with no
//! precipitation. The layout is the one the open decoders read
//! (FlightAware's dump978, extract_nexrad.c, and Stratux).

/// A block's width and height, degrees, at scale 1.
const BLOCK_WIDTH: f64 = 48.0 / 60.0;
const BLOCK_HEIGHT: f64 = 4.0 / 60.0;
const BLOCKS_PER_RING: u32 = 450;
/// Above this block number (60 degrees) the blocks are twice as wide.
const BLOCK_THRESHOLD: u32 = 405_000;
pub const BINS: usize = 128;

/// One block with its bins, north row first, west to east.
#[derive(Clone, Debug, PartialEq)]
pub struct Block {
    pub id: u32,
    pub north: f64,
    pub west: f64,
    pub south: f64,
    pub east: f64,
    pub bins: Vec<u8>,
}

pub enum Read {
    Bins(Block),
    Empty(Vec<u32>),
}

/// A block's corners: its number, the hemisphere flag and its scale
/// factor (0 is 1, 1 is 5, 2 is 9 times the base block).
fn place(id: u32, south_hemisphere: bool, scale: u8) -> (f64, f64, f64, f64) {
    let factor = match scale {
        1 => 5.0,
        2 => 9.0,
        _ => 1.0,
    };
    let n = if id >= BLOCK_THRESHOLD { id & !1 } else { id };
    let raw_lat = BLOCK_HEIGHT * (n / BLOCKS_PER_RING) as f64;
    let mut west = (n % BLOCKS_PER_RING) as f64 * BLOCK_WIDTH;
    let width = if n >= BLOCK_THRESHOLD { 2.0 * BLOCK_WIDTH } else { BLOCK_WIDTH } * factor;
    let height = BLOCK_HEIGHT * factor;
    let north = if south_hemisphere { -raw_lat } else { raw_lat + BLOCK_HEIGHT };
    if west > 180.0 {
        west -= 360.0;
    }
    (north, west, north - height, west + width)
}

/// The block (or empty blocks) in a NEXRAD APDU's payload.
pub fn read(d: &[u8]) -> Option<Read> {
    if d.len() < 4 {
        return None;
    }
    let rle = d[0] & 0x80 != 0;
    let south = d[0] & 0x40 != 0;
    let scale = (d[0] & 0x30) >> 4;
    let id = ((d[0] & 0x0F) as u32) << 16 | (d[1] as u32) << 8 | d[2] as u32;
    if rle {
        let mut bins = Vec::with_capacity(BINS);
        for &b in &d[3..] {
            let run = (b >> 3) as usize + 1;
            for _ in 0..run {
                if bins.len() < BINS {
                    bins.push(b & 0x07);
                }
            }
        }
        bins.resize(BINS, 0);
        let (north, west, south_edge, east) = place(id, south, scale);
        return Some(Read::Bins(Block { id, north, west, south: south_edge, east, bins }));
    }
    // Empty blocks: the one numbered, then a bitmap of those after it in
    // its ring -- the first byte's top four bits the next four, then each
    // byte eight more (dump978's decode of the "empty" form).
    let count = (d[3] & 0x0F) as usize;
    let ring_start = id - id % BLOCKS_PER_RING;
    let offset = id - ring_start;
    let mut ids = vec![id];
    for i in 0..count {
        let Some(&b) = d.get(3 + i) else { break };
        let b = if i == 0 { (b & 0xF0) | 0x08 } else { b };
        for j in 0..8u32 {
            if b & (1 << j) != 0 {
                let along = (offset + 8 * i as u32 + j).checked_sub(3);
                if let Some(along) = along.filter(|&a| a != offset) {
                    ids.push(ring_start + along % BLOCKS_PER_RING);
                }
            }
        }
    }
    Some(Read::Empty(ids))
}

/// One level's rectangles, [south, west, north, east] each: a row of a
/// block's bins of the same level joined, so a map draws a few hundred
/// shapes rather than every bin. A bin whose middle `covered` says is
/// drawn already (by a finer product) is left out.
pub fn rects(blocks: &[&Block], level: u8, covered: &dyn Fn(f64, f64) -> bool) -> Vec<[f64; 4]> {
    let mut out = Vec::new();
    for b in blocks {
        let (bin_w, bin_h) = ((b.east - b.west) / 32.0, (b.north - b.south) / 4.0);
        for row in 0..4 {
            let top = b.north - row as f64 * bin_h;
            let mut x = 0;
            let mid = top - bin_h / 2.0;
            let here = |x: usize| b.bins[row * 32 + x] == level && !covered(mid, b.west + (x as f64 + 0.5) * bin_w);
            while x < 32 {
                if !here(x) {
                    x += 1;
                    continue;
                }
                let start = x;
                while x < 32 && here(x) {
                    x += 1;
                }
                out.push([top - bin_h, b.west + start as f64 * bin_w, top, b.west + x as f64 * bin_w]);
            }
        }
    }
    out
}

/// The number of the base (scale 1) block a point is in, north of the
/// equator and below 60 degrees: the block a regional product would send
/// for it.
pub fn block_at(lat: f64, lon: f64) -> Option<u32> {
    if !(0.0..60.0).contains(&lat) {
        return None;
    }
    let east = if lon < 0.0 { lon + 360.0 } else { lon };
    let ring = (lat / BLOCK_HEIGHT).floor() as u32;
    let col = ((east / BLOCK_WIDTH).floor() as u32).min(BLOCKS_PER_RING - 1);
    Some(ring * BLOCKS_PER_RING + col)
}

/// A block's payload built run-length coded, for the tests and fixtures.
pub fn built(id: u32, scale: u8, bins: &[u8]) -> Vec<u8> {
    let mut d = vec![0x80 | (scale << 4) | (id >> 16) as u8 & 0x0F, (id >> 8) as u8, id as u8];
    let mut i = 0;
    while i < bins.len() {
        let level = bins[i];
        let mut run = 1;
        while i + run < bins.len() && bins[i + run] == level && run < 32 {
            run += 1;
        }
        d.push(((run - 1) as u8) << 3 | level);
        i += run;
    }
    d
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_block_over_chicago() {
        // Ring 628 (41.8667 N), the 349th block east of Greenwich (279.2 E,
        // so 80.8 W): its north edge 41 deg 56 min, 4 minutes high.
        let id = 628 * 450 + 349;
        let mut bins = vec![0u8; 128];
        bins[0..4].copy_from_slice(&[3, 3, 5, 5]);
        let Some(Read::Bins(b)) = read(&built(id, 0, &bins)) else { panic!() };
        assert!((b.north - (41.0 + 56.0 / 60.0)).abs() < 1e-9 && (b.south - (41.0 + 52.0 / 60.0)).abs() < 1e-9);
        assert!((b.west + 80.8).abs() < 1e-9 && (b.east + 80.0).abs() < 1e-9);
        assert_eq!(b.bins, bins);
        let threes = rects(&[&b], 3, &|_, _| false);
        assert_eq!(block_at(41.9, -80.5), Some(id));
        assert!(rects(&[&b], 3, &|_, _| true).is_empty());
        assert_eq!(threes.len(), 1);
        assert!((threes[0][3] - (b.west + 2.0 * 0.025)).abs() < 1e-9);
        assert!((threes[0][2] - b.north).abs() < 1e-9);
    }

    #[test]
    fn empty_blocks() {
        // Block 1000 empty, and by the first byte's bits 4 and 6 the 1st and
        // 3rd after it, by the next byte's bit 0 the 5th.
        let Some(Read::Empty(ids)) = read(&[0x00, 0x03, 0xE8, 0x52, 0x01]) else { panic!() };
        assert_eq!(ids, vec![1000, 1001, 1003, 1005]);
    }
}
