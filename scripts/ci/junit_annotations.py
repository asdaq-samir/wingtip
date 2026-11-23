"""Each failing JUnit test as a GitHub annotation, which anyone can read
(a job's log takes admin rights): ci.yml's test-gateway, on failure, from
services/gateway. Its title is `Class.method`, which failure_summary.py
turns into the narrow `mvn test -Dtest=Class` that reproduces it.

  python3 scripts/ci/junit_annotations.py [REPORTS_GLOB]
"""

import glob
import sys
import xml.etree.ElementTree as ET


def main(pattern: str = "target/surefire-reports/TEST-*.xml") -> None:
    for path in sorted(glob.glob(pattern)):
        for case in ET.parse(path).getroot().iter("testcase"):
            for problem in [*case.iter("failure"), *case.iter("error")]:
                lines = (problem.text or problem.get("message") or "").strip().splitlines()
                kept = lines[:6] + [line for line in lines[6:] if line.startswith("Caused by")]
                text = "\n".join(kept).replace("%", "%25").replace("\r", "").replace("\n", "%0A")
                test = case.get("classname").rsplit(".", 1)[-1] + "." + case.get("name")
                test = test.replace("%", "%25").replace(":", "%3A").replace(",", "%2C")
                print(f"::error title={test}::{text}")


if __name__ == "__main__":
    main(*sys.argv[1:2])
