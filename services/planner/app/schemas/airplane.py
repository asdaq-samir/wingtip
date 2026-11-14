"""An airplane's public record for its card (wingtip.aircraft_details) and
its photo (wingtip.aircraft_photo)."""

from pydantic import BaseModel

from .traffic import AircraftRegistration, PastFlightField


class AircraftModel(BaseModel):
    """The FAA's reference record of a make, model and series (ACFTREF.txt,
    ardata.pdf's Aircraft Reference File). `cruise_mph` is the FAA's
    "average cruising speed" in statute miles an hour, on some records
    only: a reference figure, not one to plan with. `tc_data_sheet` and
    `tc_holder` are the type certificate data sheet's number and holder,
    where the FAA's file gives them (about one airplane in ten)."""

    code: str
    manufacturer: str | None = None
    model: str | None = None
    aircraft_type: str | None = None
    engine_type: str | None = None
    category: str | None = None
    builder_certification: str | None = None
    engines: int | None = None
    seats: int | None = None
    weight_class: str | None = None
    cruise_mph: int | None = None
    tc_data_sheet: str | None = None
    tc_holder: str | None = None


class EngineModel(BaseModel):
    """The FAA's reference record of an engine (ENGINE.txt): horsepower for
    piston and turbine-shaft engines, thrust for jets."""

    code: str
    manufacturer: str | None = None
    model: str | None = None
    engine_type: str | None = None
    horsepower: int | None = None
    thrust_lb: int | None = None


class PastRegistration(BaseModel):
    """A canceled registration (DEREG.txt): this airframe's own under this
    or another N-number (`same_airframe`), or another airplane's that had
    this N-number before. The FAA gives no reason for a cancellation beyond
    its `status` then and an `export_country`; the registrant's name and
    town, not the street."""

    n_number: str | None = None
    serial: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    year: int | None = None
    owner: str | None = None
    owner_type: str | None = None
    co_owners: int = 0
    city: str | None = None
    state: str | None = None
    country: str | None = None
    status: str | None = None
    cancel_date: str | None = None
    export_country: str | None = None
    certificate_issued: str | None = None
    last_action: str | None = None
    airworthiness: str | None = None
    airworthiness_date: str | None = None
    mode_s_hex: str | None = None
    kit: str | None = None
    same_airframe: bool = False


class RegistryDocument(BaseModel):
    """A document filed for recording against the N-number (DOCINDEX.txt,
    about the last month's): its kind (bill of sale, lien, release...), the
    day the Registry received it, entered and corrected it."""

    document_id: str | None = None
    kind: str | None = None
    kind_code: str | None = None
    received: str | None = None
    entered: str | None = None
    corrected: str | None = None


class Reservation(BaseModel):
    """The N-number's reservation (RESERVED.txt): who reserved it and where
    (name and town), when, the kind, and an N-number change in process."""

    registrant: str | None = None
    city: str | None = None
    state: str | None = None
    reserved: str | None = None
    kind: str | None = None
    kind_code: str | None = None
    expiration_notice: str | None = None
    change_to: str | None = None
    purge: str | None = None


class NtsbCase(BaseModel):
    """An accident or incident of the airplane in the NTSB's database (cases
    since 2008), in the NTSB's words, with its CAROL report and docket."""

    ntsb_no: str | None = None
    ev_id: str
    date: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    kind: str | None = None
    highest_injury: str | None = None
    damage: str | None = None
    phase: str | None = None
    carol_url: str
    docket_url: str | None = None


class UsualBase(BaseModel):
    """Where the airplane is usually based, by the engine's `usual_base`
    over its flights ADS-B receivers heard: `field` None where they do not
    show one clearly; `count` of its `ends` (takeoffs and landings) at the
    field most of them are at."""

    field: PastFlightField | None = None
    count: int = 0
    ends: int = 0


class DataSource(BaseModel):
    name: str
    credit: str


class AirplaneDetails(BaseModel):
    """Everything public about a US airplane by its N-number
    (wingtip.aircraft_details): the FAA registry's records, the NTSB's
    cases and where it is usually based. A part the stores do not hold is
    null or empty. `based_pending`: being looked up, ask again shortly."""

    n_number: str
    registration: AircraftRegistration | None = None
    model: AircraftModel | None = None
    engine: EngineModel | None = None
    past_registrations: list[PastRegistration] = []
    documents: list[RegistryDocument] = []
    reservation: Reservation | None = None
    ntsb: list[NtsbCase] = []
    based: UsualBase | None = None
    based_pending: bool = False
    sources: list[DataSource] = []


class AirplanePhoto(BaseModel):
    """The newest photo of this very airplane on Planespotters.net. Its
    terms: show `photographer` as visible text next to the image, make the
    image a plain link to `link`, load the image straight from
    `thumbnail`/`thumbnail_large` unchanged, and never store or pass it on."""

    thumbnail: str | None = None
    thumbnail_large: str | None = None
    width: int | None = None
    height: int | None = None
    photographer: str | None = None
    link: str
    source: str = "Planespotters.net"
