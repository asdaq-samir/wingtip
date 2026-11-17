use super::*;

impl Read<'_> {
    pub(super) fn sky_layer(&mut self, i: usize) -> usize {
        let cover = cover_of(self.word(i)).unwrap_or("broken");
        let mut j = i + 1;
        while matches!(self.word(j), "clouds" | "cloud" | "layer" | "at") {
            j += 1;
        }
        let mut from = i;
        let base = if let Some(b) = self.int(j) {
            j += 1;
            Some(b)
        } else if i > 0 && !self.used[i - 1] && self.int(i - 1).is_some() {
            // "two thousand five hundred scattered": the height first.
            from = i - 1;
            self.int(i - 1)
        } else {
            None
        };
        self.take(from, j);
        self.out.sky.push(Layer { cover, base_ft: base });
        j
    }

    pub(super) fn approach(&mut self, i: usize) -> usize {
        // The phrase round "approach": back to the last figure taken, at
        // most eight words, for its kinds and runways; on through "in use"
        // and a runway after it.
        let mut start = i;
        while start > 0 && i - start < 8 && !self.used[start - 1] {
            start -= 1;
        }
        let mut kinds: Vec<String> = Vec::new();
        let mut runways: Vec<String> = Vec::new();
        let mut first = None;
        let mut k = start;
        while k < i {
            if let Some(kind) = approach_kind(self.word(k)) {
                first.get_or_insert(k);
                // Kinds said together ("RNAV GPS") are one approach.
                if k > start && approach_kind(self.word(k - 1)).is_some() {
                    let last = kinds.pop().unwrap_or_default();
                    kinds.push(format!("{last} {kind}"));
                } else {
                    kinds.push(kind.to_owned());
                }
                k += 1;
            } else if self.word(k) == "runway" && first.is_some() {
                match self.runway_at(k + 1) {
                    Some((r, next)) => {
                        runways.push(r);
                        k = next;
                    }
                    None => k += 1,
                }
            } else {
                k += 1;
            }
        }
        let Some(first) = first else { return i + 1 };
        let mut j = i + 1;
        if self.word(j) == "in" && self.word(j + 1) == "use" {
            j += 2;
        }
        if self.word(j) == "runway"
            && let Some((r, next)) = self.runway_at(j + 1)
        {
            runways.push(r);
            j = next;
            if self.word(j) == "in" && self.word(j + 1) == "use" {
                j += 2;
            }
        }
        let mut said = kinds.join(" and ");
        if !runways.is_empty() {
            said.push_str(if runways.len() == 1 { " runway " } else { " runways " });
            said.push_str(&runways.join(" and "));
        }
        self.take(first, j);
        if self.out.approach.is_none() {
            self.out.approach = Some(said);
        }
        j
    }

    /// "landing and departing runway one niner right", "arriving runway
    /// two five, departing runway three one left", "runway in use one two".
    pub(super) fn runways(&mut self, i: usize) -> usize {
        let mode = |w: &str| match w {
            "landing" | "arriving" | "arrival" | "arrivals" => Some((true, false)),
            "departing" | "departure" | "departures" => Some((false, true)),
            _ => None,
        };
        let (mut landing, mut departing) = match self.word(i) {
            "runway" | "runways" | "using" | "active" => (true, true),
            w => match mode(w) {
                Some(m) => m,
                None => return i + 1,
            },
        };
        let mut j = i + 1;
        if self.word(j) == "and"
            && let Some((l, d)) = mode(self.word(j + 1))
        {
            landing |= l;
            departing |= d;
            j += 2;
        }
        while matches!(self.word(j), "runway" | "runways" | "on" | "in" | "use" | "is" | "are") {
            j += 1;
        }
        let mut found = Vec::new();
        while let Some((r, next)) = self.runway_at(j) {
            found.push(r);
            j = next;
            if self.word(j) == "and" && self.runway_at(j + 1).is_some() {
                j += 1;
            }
        }
        if found.is_empty() {
            return i + 1;
        }
        self.take(i, j);
        if landing {
            self.out.landing.extend(found.iter().cloned());
        }
        if departing {
            self.out.departing.extend(found);
        }
        j
    }

    /// The leftover runs of words, each a remark: trimmed of filler, and
    /// dropped where one word is left unless it is weather.
    pub(super) fn remarks(&mut self, after: usize) {
        let mut i = after;
        while i < self.toks.len() {
            if self.used[i] {
                i += 1;
                continue;
            }
            let start = i;
            while i < self.toks.len() && !self.used[i] {
                i += 1;
            }
            let mut a = start;
            let mut b = i;
            while a < b && FILLER.contains(&self.word(a)) {
                a += 1;
            }
            while b > a && FILLER.contains(&self.word(b - 1)) {
                b -= 1;
            }
            if b - a >= 2 || (b - a == 1 && PHENOMENA.contains(&self.word(a))) {
                let words: Vec<&str> = self.toks[a..b].iter().map(|t| t.num.as_deref().unwrap_or(&t.word)).collect();
                self.out.remarks.push(words.join(" "));
            }
        }
    }
}
