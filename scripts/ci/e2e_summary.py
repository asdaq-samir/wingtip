"""A browser shard's outcome as one annotation (ci.yml, e2e): its tally,
where the setup's time went and how busy the runner was, its slowest
tests and the log's tail. SHARD names the shard; reads /tmp/e2e-out.
"""

import os
import re


def say(level, title, text):
    text = text.replace("%", "%25").replace("\r", "").replace("\n", "%0A")[:4000]
    print(f"::{level} title={title}::{text}")


shard = os.environ["SHARD"]
# When each piece of the setup was done, from the background
# pieces' and the steps' own notes: where the time before the
# first test went.
setup, events = "before the first test, seconds from the job's first step: ", []
try:
    notes = open("/tmp/e2e-out/timeline").read().splitlines()
    events = sorted((int(note.split(" ", 1)[0]), note.split(" ", 1)[1]) for note in notes if " " in note)
    setup += ", ".join(f"{t} {what}" for t, what in events)
except (OSError, ValueError) as err:
    setup += f"unknown ({err})"
# And how busy the runner was until then, from vmstat's samples
# (one a second from the first step): whether the setup waits on
# the processors or on the disk.
try:
    rows = [row.split() for row in open("/tmp/e2e-out/vmstat.log").read().splitlines()]
    head = next(r for r in rows if "wa" in r and "bo" in r)
    data = [r for r in rows if len(r) == len(head) and r[0].isdigit()][1:]
    data = data[: next((t for t, what in events if what == "the tests"), len(data))] or data

    def mean(name):
        return sum(float(r[head.index(name)]) for r in data) / len(data)

    def peak(name):
        return max(float(r[head.index(name)]) for r in data)

    setup += (
        f"; meanwhile the processors {100 - mean('id'):.0f}% busy (user {mean('us'):.0f}, system "
        f"{mean('sy'):.0f}, waiting on the disk {mean('wa'):.0f}), {mean('bo') / 1024:.0f} MB/s "
        f"written ({peak('bo') / 1024:.0f} at most), {mean('bi') / 1024:.0f} read, over {len(data)} s"
    )
except (OSError, StopIteration, ValueError, ZeroDivisionError) as err:
    setup += f"; the runner's load unknown ({err!r})"
path = "/tmp/e2e-out/playwright.log"
if not os.path.exists(path):
    say("warning", f"shard {shard}: no output", "the tests never wrote their log\n" + setup)
else:
    lines = open(path, errors="replace").read().splitlines()
    summary = [line for line in lines if re.match(r"\s*\d+ (passed|failed|flaky|skipped)", line)]
    # The shard's slowest tests, from the list reporter's
    # "✓ 12 [mobile] › e2e/x.spec.ts:40:1 › title (2.9s)": what
    # to look at first when a shard runs long.
    timed = []
    for line in lines:
        m = re.search(r"\[(\w+)\] › e2e/(\S+?):\d+:\d+ › (.*) \((\d+(?:\.\d+)?)(ms|s|m)\)\s*$", line)
        if m:
            value = float(m[4]) * {"ms": 0.001, "s": 1, "m": 60}[m[5]]
            timed.append((value, f"{value:5.1f}s {m[2]} [{m[1]}] {m[3][:70]}"))
    slowest = [text for _, text in sorted(timed, reverse=True)[:8]]
    say("notice" if summary else "warning", f"shard {shard}", "\n".join(summary + [setup, "slowest:"] + slowest + ["--"] + lines[-25:]))
