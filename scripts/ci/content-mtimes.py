"""Give each file a modification time made from its content, for a cached build.

A fresh checkout stamps every file with the time of the checkout, so a build
system that compares times (xcodebuild's) treats every source as changed and
recompiles the lot, cached DerivedData or not. Stamped from a hash of its
bytes, a file has the same time in every run it is the same in, and another
time the moment it differs: a cached build recompiles what changed and no
more (native-ios.yml). Directories get one from the names they hold.

    python3 scripts/ci/content-mtimes.py PATH...
"""

import hashlib
import os
import sys

# 2001-01-01 onwards, a span of about eight years: any stamp is far in the
# past, and two different contents share one with odds of 1 in 2**28.
EPOCH = 978307200
SPAN = 1 << 28


def stamp(data: bytes) -> int:
    return EPOCH + int.from_bytes(hashlib.sha1(data).digest()[:8], "big") % SPAN


def walk(root: str) -> int:
    count = 0
    if os.path.isfile(root) and not os.path.islink(root):
        with open(root, "rb") as f:
            t = stamp(f.read())
        os.utime(root, (t, t))
        return 1
    # Bottom up, so a directory is stamped after the files in it.
    for here, dirs, files in os.walk(root, topdown=False):
        for name in files:
            path = os.path.join(here, name)
            if os.path.islink(path):
                continue
            with open(path, "rb") as f:
                t = stamp(f.read())
            os.utime(path, (t, t))
            count += 1
        t = stamp("\0".join(sorted(dirs + files)).encode())
        os.utime(here, (t, t))
    return count


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    total = sum(walk(p) for p in sys.argv[1:] if os.path.exists(p))
    print(f"content-mtimes: {total} files stamped")
