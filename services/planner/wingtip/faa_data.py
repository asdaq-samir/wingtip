"""FAA NASR navaid data and Digital Obstacle File (DOF) data -- more
authoritative sources than OSM tags for VOR navaids and towers/obstacles,
since the FAA is the ground truth for both (and this project already
treats the FAA sectional chart, not OSM/satellite imagery, as the
reference for what a pilot would see -- see wingtip.chartvision).

Both are published as a full national dump (not queryable by bbox
server-side, unlike Overpass) -- NASR on a 28-day cycle, the obstacles
every 56 days -- so they're downloaded and cached under data/raw/ rather
than re-fetched every notebook run: ensure_nasr_file() downloads a file
that is missing, and wingtip.faa_editions a newer edition of one there.
"""

import io
import json
import logging
import zipfile
from collections.abc import Iterable
from datetime import date
from pathlib import Path

import requests
import wingtip_native

from . import apra, dof

# The obstacle file's reader is wingtip.dof; its callers read the table
# through this module, which downloads it with the NASR tables.
from .dof import _DOF_COLUMNS, _OBSTACLES_CACHE, load_obstacles  # noqa: F401

# FAA's site 403s a bare python-requests User-Agent.
from .config import FAA_HEADERS
from .retry import with_retries

# The table readers, the field sets, the contacts, the frequencies and the
# route's candidates are each their own module; this one downloads the
# files they read, and its callers ask for them here.
from .faa_apt_base import _military_of, _patterns_of, _private_of, _read_apt_base, _read_apt_base_cached, _towered_of  # noqa: F401
from .faa_contacts import NO_SERVICES, _contacts_of, _services_of  # noqa: F401
from .faa_frequencies import _frequencies_of, _listed  # noqa: F401
from .faa_route_airports import (  # noqa: F401
    CHARTED_FACILITY_TYPES,
    VOR_NAV_TYPES,
    _SITE_TYPE_NAMES,
    _in_bbox,
    load_route_airports,
    load_vor_navaids,
)

log = logging.getLogger(__name__)


def download_and_extract(url: str, dest_dir: Path, retries: int = 3, only: Iterable[str] | None = None) -> None:
    """Downloads the zip at url and extracts it into dest_dir, retrying
    on transient failures -- the FAA's NASR/DOF archives are large enough
    that a single flaky connection isn't unusual.

    With `only`, just the members of those names: the DOF archive carries
    a file per state beside the whole country's DOF.DAT, and the NASR
    ones a dozen tables and their layouts the planner never reads -- 190
    MB of the 950 under data/raw/faa_nasr, extracted for nothing."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    wanted = set(only) if only is not None else None

    def attempt() -> None:
        resp = requests.get(url, headers=FAA_HEADERS, timeout=180)
        resp.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            members = zf.namelist() if wanted is None else [m for m in zf.namelist() if Path(m).name in wanted]
            zf.extractall(dest_dir, members=members)

    with_retries(attempt, describe=f"Download of {url}", retries=retries, transient=(requests.RequestException, zipfile.BadZipFile))


def _is_icloud_evicted(path: Path) -> bool:
    """Whether iCloud has offloaded this file, leaving a placeholder.

    macOS replaces an evicted file with a hidden sibling named
    ".<filename>.icloud" of a couple of hundred bytes, and the real path
    stops existing. An existence check therefore reports "missing"
    correctly, but the reason matters: re-downloading a national dataset
    does not help if the directory is going to offload it again. Seen
    three times in one day on this project -- Class_Airspace.shp, then
    its .dbf, then APT_BASE.csv -- so it is worth naming rather than
    rediscovering.

    A file is only evicted if the real path is gone *and* the placeholder
    is there. Testing for the placeholder alone was wrong: iCloud leaves
    it beside a file it is restoring, so a present, readable 83 MB
    DOF.DAT was reported as evicted and took the whole request down with
    it.
    """
    return not path.exists() and (path.parent / f".{path.name}.icloud").exists()


# Which zip each file comes in: a NASR table's CSV zip of the edition
# in force (wingtip.apra), or the obstacle file's own.
_NASR_FILES = {
    "NAV_BASE.csv": "NAV",
    # In the same zip: each navaid's remarks, where its service volume's
    # restrictions are ("VOR UNUSBL 072-090 BYD 34 NM", wingtip.fixes).
    "NAV_RMK.csv": "NAV",
    "APT_BASE.csv": "APT",
    "APT_RMK.csv": "APT",  # every airport's remarks, the Chart Supplement's text (wingtip.remarks)
    "CLS_ARSP.csv": "CLS_ARSP",  # each field's Class Airspace hours, its AIRSPACE line (wingtip.field_details)
    # And each runway end's: which way its traffic pattern is flown
    # (wingtip.pattern).
    "APT_RWY_END.csv": "APT",
    # And each runway's length and surface (RWY_LEN, SURFACE_TYPE_CODE):
    # what the map's airport symbol is drawn by (wingtip.vector_tiles).
    "APT_RWY.csv": "APT",
    # And each field's contacts: its manager's and its owner's office
    # address and phone, what an airport's card calls and finds in Maps.
    "APT_CON.csv": "APT",
    "DOF.DAT": "DOF",
    # Every named fix: the RNAV (GPS) waypoints, the reporting points and
    # the VFR waypoints charted on the sectionals (VPBNG) -- what a route
    # may fly through on the way (wingtip.fixes).
    "FIX_BASE.csv": "FIX",
    # Every facility's frequencies, by the field each serves: the CTAF,
    # UNICOM, tower, ground, ATIS and approach the Chart Supplement lists
    # (airport_frequencies).
    "FRQ.csv": "FRQ",
    # Every airway segment, Victor and T routes among them, in order, each
    # with its MEA, MOCA and MAA (wingtip.airways).
    "AWY_SEG_ALT.csv": "AWY",
}


def nasr_zip_url(table: str, cycle: date | None = None) -> str:
    """Where a table's zip is: the DOF page's current one, the Class
    Airspace shapes or a NASR CSV zip of `cycle` (APRA's current NASR
    edition when not given)."""
    if table == "DOF":
        return dof.dof_link()
    cycle = cycle or apra.nasr_cycle()
    return apra.class_airspace_url(cycle) if table == "Class_Airspace" else apra.nasr_csv_url(table, cycle)


def ensure_nasr_file(name: str, cache_dir) -> Path:
    """One of the NASR/DOF files -- "NAV_BASE.csv", "APT_BASE.csv" or
    "DOF.DAT" -- downloaded and extracted into cache_dir if it is not
    there, and its path.

    Each file on its own: the three used to be ensured together and any
    one missing failed all of them, so an evicted APT_BASE.csv failed the
    terrain floor, which reads only DOF.DAT, after scraping the NASR index
    and downloading a zip it did not need.
    """
    cache_dir = Path(cache_dir)
    path = cache_dir / name
    if not path.exists():
        download_and_extract(nasr_zip_url(_NASR_FILES[name]), cache_dir, only=_NASR_FILES)
    if path.exists():
        return path
    if _is_icloud_evicted(path):
        raise RuntimeError(
            f"iCloud evicted {name} from {cache_dir}. Re-downloading "
            "will not hold while this directory syncs to iCloud -- exclude data/raw "
            "from syncing (a parent directory named to end in '.nosync', or keeping "
            "the project outside Desktop/Documents)."
        )
    raise RuntimeError(f"Missing after download: {name} in {cache_dir}.")


def ensure_nasr_data(cache_dir) -> tuple:
    """(nav_csv_path, apt_csv_path, dof_dat_path), each ensured as
    ensure_nasr_file does -- for the pipeline's collect and notebook 01,
    which read all three."""
    return tuple(ensure_nasr_file(name, cache_dir) for name in ("NAV_BASE.csv", "APT_BASE.csv", "DOF.DAT"))


def published_pattern_agl_ft(ident: str, cache_dir) -> float | None:
    """APT_BASE's TPA, in feet above the field, where the FAA publishes
    one (about one field in twenty-five, often 800 ft under a Class B
    shelf), by its FAA or ICAO identifier; None where it does not -- and
    where the file cannot be had, since a nav log's top of descent is no
    reason to fail it."""
    try:
        path = ensure_nasr_file("APT_BASE.csv", cache_dir)
        patterns = _patterns_of(str(path), path.stat().st_mtime)
    except Exception:
        log.warning("No APT_BASE.csv for pattern altitudes; %s gets none published", ident, exc_info=True)
        return None
    return patterns.get(ident.strip().upper())


def military_fields(cache_dir) -> dict:
    """Every field the armed services own (APT_BASE's OWNERSHIP_TYPE_CODE,
    the engine's field_military), by its FAA and ICAO identifiers: "military" where it
    is not open to the public -- a civil airplane lands there only with
    the service's permission, for the Air Force a Civil Aircraft Landing
    Permit (32 CFR part 855) -- and "joint" where it is (FACILITY_USE_CODE
    PU). Empty where the file cannot be had: the map then marks none."""
    try:
        path = ensure_nasr_file("APT_BASE.csv", cache_dir)
        return _military_of(str(path), path.stat().st_mtime)
    except Exception:
        log.warning("No APT_BASE.csv for military fields; none marked", exc_info=True)
        return {}


def towered_fields(cache_dir) -> frozenset:
    """Every field with a control tower (APT_BASE's TWR_TYPE_CODE ATCT,
    ATCT-A/C, ATCT-TRACON and the rest; NON-ATCT is none), by its FAA and
    ICAO identifiers: the sectional draws these in blue and every other
    field in magenta (FAA Aeronautical Chart User's Guide, VFR Terms and
    Symbols, Airports). Empty where the file cannot be had: the map then
    draws every field in magenta, as an untowered one."""
    try:
        path = ensure_nasr_file("APT_BASE.csv", cache_dir)
        return _towered_of(str(path), path.stat().st_mtime)
    except Exception:
        log.warning("No APT_BASE.csv for towered fields; none marked", exc_info=True)
        return frozenset()


def private_fields(cache_dir) -> frozenset:
    """Every field closed to the public (APT_BASE's FACILITY_USE_CODE PR),
    by its FAA and ICAO identifiers -- the sectional's R in a circle, a
    field to land at only with its owner's permission -- but for those the
    armed services own, which are military_fields'. Empty where the file
    cannot be had: the map then marks none."""
    try:
        path = ensure_nasr_file("APT_BASE.csv", cache_dir)
        return _private_of(str(path), path.stat().st_mtime)
    except Exception:
        log.warning("No APT_BASE.csv for private fields; none marked", exc_info=True)
        return frozenset()


def airport_contact(ident: str, cache_dir) -> dict:
    """How to reach a field on the ground, from the FAA's own airport file
    (NASR's APT_CON, the contacts the Chart Supplement is made from): a
    phone and a one-line street address, the manager's first and the
    owner's where there is none, by its FAA or ICAO identifier -- no
    names. Each None where the FAA lists none (a box number is no
    address), and both where the file cannot be had: a card without them,
    not a card that failed."""
    try:
        path = ensure_nasr_file("APT_CON.csv", cache_dir)
        base = ensure_nasr_file("APT_BASE.csv", cache_dir)
        contacts = _contacts_of(str(path), path.stat().st_mtime, str(base), base.stat().st_mtime)
    except Exception:
        log.warning("No APT_CON.csv for airport contacts; %s gets none", ident, exc_info=True)
        return {"phone": None, "address": None}
    return contacts.get(ident.strip().upper(), {"phone": None, "address": None})


def airport_services(ident: str, cache_dir) -> dict:
    """What a field offers on the ground, as its Chart Supplement entry
    lists it (NASR's APT_BASE): the fuel it sells, whether it charges a
    landing fee (None where the FAA does not say), tie-downs and hangars
    for a transient, airframe and engine repair ("major", "minor" or
    None) and oxygen, by its FAA or ICAO identifier. Nothing where the
    file cannot be had: a card without them, not a card that failed."""
    try:
        base = ensure_nasr_file("APT_BASE.csv", cache_dir)
        services = _services_of(str(base), base.stat().st_mtime)
    except Exception:
        log.warning("No APT_BASE.csv for airport services; %s gets none", ident, exc_info=True)
        return dict(NO_SERVICES)
    return services.get(ident.strip().upper(), dict(NO_SERVICES))


def _frequency_table(cache_dir) -> tuple[dict, frozenset] | None:
    """FRQ.csv's frequencies by field (_frequencies_of), or None where the
    file cannot be had, for the caller's own fallback."""
    try:
        path = ensure_nasr_file("FRQ.csv", cache_dir)
        base = ensure_nasr_file("APT_BASE.csv", cache_dir)
        return _frequencies_of(str(path), path.stat().st_mtime, str(base), base.stat().st_mtime)
    except Exception:  # noqa: BLE001 -- the FAA out or the file damaged: the caller's own list instead
        log.warning("No FRQ.csv for frequencies; the fallback is used", exc_info=True)
        return None


def airport_frequencies_for(idents, cache_dir) -> dict[str, list[dict]]:
    """airport_frequencies for several fields from one look at the file
    (one fetch, one warning where it cannot be had), by ident as given,
    upper-cased; the fields the file lists nothing for are left out."""
    table = _frequency_table(cache_dir)
    if table is None:
        return {}
    wanted = {i.strip().upper() for i in idents}
    found = {i: _listed(table, i) for i in wanted}
    return {i: [dict(f) for f in listed] for i, listed in found.items() if listed}


def airport_frequencies(ident: str, cache_dir) -> list[dict] | None:
    """A field's frequencies from the FAA's own file (NASR's FRQ, what
    the Chart Supplement and the sectional's airport data are made from),
    by its FAA or ICAO identifier: its CTAF and UNICOM, tower, ground,
    clearance, ATIS, the approach and departure that serve it (with their
    sectors) and the Flight Service outlets named for it, each a VHF
    frequency, as [{"type", "description", "frequency_mhz"}]. OurAirports'
    copy, which the card read, had none for Salem (I83), whose 123.0 is on
    the chart. None where the file cannot be had or lists nothing for the
    field, for the caller's own fallback."""
    table = _frequency_table(cache_dir)
    found = _listed(table, ident) if table else None
    return [dict(f) for f in found] if found else None


def pattern_agl_ft(ident: str, cache_dir) -> float:
    """How high above the field its traffic pattern is flown: the TPA
    the FAA publishes (published_pattern_agl_ft), else AC 90-66C's 1,000
    ft for a propeller airplane -- the shared engine's rule
    (wingtip_engine::runway::pick::pattern_altitude, through
    wingtip_native.call), as wingtip.pattern and the phones ask it."""
    published = published_pattern_agl_ft(ident, cache_dir)
    return json.loads(wingtip_native.call("pattern_altitude", json.dumps({"published_agl_ft": published})))["agl_ft"]


def preload_obstacles(cache_dir) -> None:
    """Parses (or reads back) the obstacle table now, so a service can
    pay the cold cost at startup rather than on a pilot's first request."""
    dof._load_all_obstacles(ensure_nasr_file("DOF.DAT", cache_dir))
