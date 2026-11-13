//! GDL 90's frames as they come over the Wi-Fi (Garmin's GDL 90 Data
//! Interface Specification, 560-1058-00 Rev A, section 2.2): each message
//! is its ID and data, then a two-byte Frame Check Sequence, with a Flag
//! Byte (0x7E) at each end; a 0x7E or 0x7D inside is sent as 0x7D and the
//! byte XOR 0x20 ("byte stuffing", 2.2.1). The FCS is the CRC-CCITT of the
//! clear message (2.2.3), least significant byte first.

/// The Flag Byte that opens and closes a frame (2.2.1).
pub const FLAG: u8 = 0x7E;
/// The Control-Escape byte (2.2.1).
pub const ESCAPE: u8 = 0x7D;

/// The CRC-CCITT table (polynomial x^16 + x^12 + x^5 + 1, 0x1021) as the
/// specification's own code builds it (2.2.3, Crc16Init).
const fn table() -> [u16; 256] {
    let mut t = [0u16; 256];
    let mut i = 0;
    while i < 256 {
        let mut crc = (i as u16) << 8;
        let mut bit = 0;
        while bit < 8 {
            crc = (crc << 1) ^ if crc & 0x8000 != 0 { 0x1021 } else { 0 };
            bit += 1;
        }
        t[i] = crc;
        i += 1;
    }
    t
}

static CRC_TABLE: [u16; 256] = table();

/// The FCS of a clear message (ID and data): the specification's
/// Crc16Compute, from zero. It adds each byte after the table rather than
/// before it, so it is not CRC-16/XMODEM nor any catalogued CRC (the `crc`
/// crate's): "123456789" checks 0xBEEF here, 0x31C3 there.
pub fn crc(message: &[u8]) -> u16 {
    message.iter().fold(0u16, |crc, &b| CRC_TABLE[(crc >> 8) as usize] ^ (crc << 8) ^ b as u16)
}

/// One frame read: its clear message (ID and data, the FCS taken off), or
/// why it was not one.
#[derive(Debug, PartialEq)]
pub enum Frame {
    Message(Vec<u8>),
    /// Its FCS did not match: a byte was lost or changed on the way. The
    /// specification says to discard it (2.2.3).
    BadCheck,
}

/// The frames in the bytes received, in order. Bytes before the first
/// Flag or after the last are part of a frame cut off, and passed over:
/// a UDP datagram carries whole frames (GDL 90 over Wi-Fi), so a cut one
/// is lost, not continued. Two Flags in a row open no frame.
pub fn frames(bytes: &[u8]) -> Vec<Frame> {
    let mut out = Vec::new();
    let mut parts = bytes.split(|&b| b == FLAG);
    // What came before the first Flag is the end of a frame cut off.
    parts.next();
    let parts: Vec<&[u8]> = parts.collect();
    // What follows the last Flag has not been closed.
    let closed = parts.len().saturating_sub(1);
    for stuffed in &parts[..closed] {
        if stuffed.is_empty() {
            continue;
        }
        let clear = unstuff(stuffed);
        if clear.len() < 3 {
            out.push(Frame::BadCheck);
            continue;
        }
        let (message, fcs) = clear.split_at(clear.len() - 2);
        if crc(message) == u16::from_le_bytes([fcs[0], fcs[1]]) {
            out.push(Frame::Message(message.to_vec()));
        } else {
            out.push(Frame::BadCheck);
        }
    }
    out
}

/// A frame's bytes with the escapes taken out (2.2.1).
fn unstuff(stuffed: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(stuffed.len());
    let mut escaped = false;
    for &b in stuffed {
        if escaped {
            out.push(b ^ 0x20);
            escaped = false;
        } else if b == ESCAPE {
            escaped = true;
        } else {
            out.push(b);
        }
    }
    out
}

/// A message framed as a receiver sends it: the FCS added, 0x7E and 0x7D
/// escaped, a Flag at each end. For the tests and fixtures; the engine
/// only reads.
pub fn framed(message: &[u8]) -> Vec<u8> {
    let mut clear = message.to_vec();
    clear.extend_from_slice(&crc(message).to_le_bytes());
    let mut out = vec![FLAG];
    for b in clear {
        if b == FLAG || b == ESCAPE {
            out.extend_from_slice(&[ESCAPE, b ^ 0x20]);
        } else {
            out.push(b);
        }
    }
    out.push(FLAG);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The specification's own example (2.2.4): a Heartbeat, whose FCS is
    /// 0x8BB3, sent B3 8B.
    #[test]
    fn the_specifications_heartbeat_checks() {
        let sent = [0x7E, 0x00, 0x81, 0x41, 0xDB, 0xD0, 0x08, 0x02, 0xB3, 0x8B, 0x7E];
        assert_eq!(crc(&sent[1..8]), 0x8BB3);
        assert_eq!(frames(&sent), vec![Frame::Message(sent[1..8].to_vec())]);
        assert_eq!(framed(&sent[1..8]), sent);
    }

    #[test]
    fn escapes_and_damage() {
        let message = [0x14, 0x7E, 0x7D, 0x01];
        let sent = framed(&message);
        assert!(sent[1..sent.len() - 1].iter().all(|&b| b != FLAG));
        assert_eq!(frames(&sent), vec![Frame::Message(message.to_vec())]);
        let mut hurt = sent.clone();
        hurt[1] ^= 0x01;
        assert_eq!(frames(&hurt), vec![Frame::BadCheck]);
        // Two frames back to back, a cut one each side.
        let mut stream = vec![0x33, 0x44];
        stream.extend(framed(&[0x00, 1, 2, 3, 4, 5, 6]));
        stream.extend(framed(&[0x0B, 0, 200, 0, 10]));
        stream.extend([FLAG, 0x14, 0x00]);
        assert_eq!(frames(&stream).len(), 2);
    }
}
