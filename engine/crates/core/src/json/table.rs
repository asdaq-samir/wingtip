//! A phone pack's place tables, `{"columns": [...], "rows": [[...], ...]}`
//! of strings, as wingtip.cycle_pack writes them (crate::spoken), read
//! with the JSON reader of the module above: each cell a string, or a
//! number or null as its text.

use super::Reader;

/// A phone pack's table: its columns, and each row's cells as strings.
pub struct Table {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

impl Table {
    pub fn col(&self, name: &str) -> Option<usize> {
        self.columns.iter().position(|c| c == name)
    }
}

impl Reader<'_> {
    /// A string, or a number or null as its text ("" for null).
    fn cell(&mut self) -> Option<String> {
        match self.peek()? {
            b'"' => self.string(),
            b'n' => {
                self.at += 4;
                Some(String::new())
            }
            _ => {
                let start = self.at;
                while self.b.get(self.at).is_some_and(|c| c.is_ascii_digit() || b"+-.eE".contains(c)) {
                    self.at += 1;
                }
                std::str::from_utf8(&self.b[start..self.at]).ok().map(str::to_owned)
            }
        }
    }

    fn cells(&mut self) -> Option<Vec<String>> {
        self.eat(b'[')?;
        let mut out = Vec::new();
        if self.eat(b']').is_some() {
            return Some(out);
        }
        loop {
            out.push(self.cell()?);
            if self.eat(b',').is_none() {
                self.eat(b']')?;
                return Some(out);
            }
        }
    }
}

/// A pack's table, `{"columns": [...], "rows": [[...], ...]}`; None where
/// the text is not one.
pub fn table(text: &str) -> Option<Table> {
    let mut r = Reader { s: text, b: text.as_bytes(), at: 0 };
    r.eat(b'{')?;
    let (mut columns, mut rows) = (None, None);
    loop {
        let key = r.string()?;
        r.eat(b':')?;
        if key == "columns" {
            columns = Some(r.cells()?);
        } else if key == "rows" {
            r.eat(b'[')?;
            let mut all = Vec::new();
            if r.eat(b']').is_none() {
                loop {
                    all.push(r.cells()?);
                    if r.eat(b',').is_none() {
                        r.eat(b']')?;
                        break;
                    }
                }
            }
            rows = Some(all);
        } else {
            return None;
        }
        if r.eat(b',').is_none() {
            r.eat(b'}')?;
            break;
        }
    }
    Some(Table { columns: columns?, rows: rows? })
}
