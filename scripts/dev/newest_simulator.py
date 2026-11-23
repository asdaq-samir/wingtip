#!/usr/bin/env python3
"""The simulator to test on, by its id: the newest of a kind this Xcode has.

    xcrun simctl list devices available -j | scripts/dev/newest_simulator.py iPhone|iPad|"iPhone Duo" [INCHES]

Prints the udid, or nothing when the kind is not installed. The one pick
for simulators.sh, check.sh, validate-wave.sh and native-ios.yml.

Sorting by name put "iPhone Air" after every numbered model on Xcode 27.2,
so the tests ran on the Air rather than the newest iPhone. The pick is the
highest model number instead, and of that model the plain one before the
Max or the e ("iPhone 18 Pro" over "iPhone 18 Pro Max" and "iPhone 18e");
an iPad is a Pro where there is one, the larger first. iPhone Duo, the
foldable, is its own kind and never an iPhone's pick.

INCHES names a screen size to take where the kind has it ("11": the iPad
Pro 11-inch): a wave's iPad legs run on the 11-inch on CI, the 13-inch's
simulator having stalled the hosted runners at the tests' start (run
45152106014); the Mac and the pictures keep the larger.
"""

import json
import re
import sys


def key(kind: str, name: str) -> tuple:
    size = re.search(r"(\d+)-inch", name)
    if kind == "iPad":
        return ("Pro" in name, int(size.group(1)) if size else 0, -len(name))
    model = re.match(rf"{re.escape(kind)} (\d+)", name)
    return (int(model.group(1)) if model else 0, -len(name))


def main() -> int:
    kind = sys.argv[1] if len(sys.argv) > 1 else "iPhone"
    devices = [
        d
        for runtime, ds in json.load(sys.stdin)["devices"].items()
        if "iOS" in runtime
        for d in ds
        if d["name"].startswith(kind) and ("Duo" in d["name"]) == (kind == "iPhone Duo")
    ]
    inches = sys.argv[2] if len(sys.argv) > 2 else ""
    sized = [d for d in devices if f"{inches}-inch" in d["name"]] if inches else []
    devices = sized or devices
    if devices:
        print(max(devices, key=lambda d: key(kind, d["name"]))["udid"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
