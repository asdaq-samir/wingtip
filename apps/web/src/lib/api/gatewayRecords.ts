import { gateway, data } from "./http";
import { ApiError } from "./errors";
import type {
  Aircraft,
  AssignLessonRequest,
  LessonProgressRequest,
  AircraftRequest,
  OwnFigures,
  Currency,
  CurrencyDatesRequest,
  Flight,
  FlightSummary,
  InspectionsRequest,
  Instructor,
  InstructorRequest,
  LogbookEntry,
  LogbookEntryRequest,
  LogbookImportResult,
  Reminders,
  SavedTrack,
  SaveFlightRequest,
  SignRequest,
  Squawk,
  SquawkRequest,
  Training,
  VorCheckRequest,
  DueItem,
  DueItemRequest,
  Paperwork,
} from "./types";

/** A logbook entry's columns kept of one drawn from the app's own track
 *  (features/logbook-auto), which a typed or imported entry has none of. */
type TrackColumns = "airHours" | "touchAndGoes" | "fromTrack" | "flightId";

/** The gateway's calls for what the pilot keeps (./client's `api`): their
 *  airplanes, logbook, paperwork, training, instruction and flights. */
export const gatewayRecords = {
  /** A signed-in pilot's own airplanes -- also a Spring Boot call,
   *  like `me()`: nothing here is planner's concern. */
  aircraft: {
    list: () => gateway.GET("/api/aircraft").then(data<Aircraft[]>),
    add: (request: AircraftRequest) => gateway.POST("/api/aircraft", { body: request }).then(data<Aircraft>),
    update: (id: number, request: AircraftRequest) =>
      gateway.PUT("/api/aircraft/{id}", { params: { path: { id } }, body: request }).then(data<Aircraft>),
    remove: async (id: number): Promise<void> => {
      await gateway.DELETE("/api/aircraft/{id}", { params: { path: { id } } });
    },
    /** Its VOR check for IFR, recorded (14 CFR 91.171(d)). */
    vorCheck: (id: number, request: VorCheckRequest) =>
      gateway.PUT("/api/aircraft/{id}/vor-check", { params: { path: { id } }, body: request }).then(data<Aircraft>),
    /** Its inspections and tests, recorded all at once (14 CFR 91.409,
     *  91.411, 91.413, 91.207). */
    inspections: (id: number, request: InspectionsRequest) =>
      gateway.PUT("/api/aircraft/{id}/inspections", { params: { path: { id } }, body: request }).then(data<Aircraft>),
    /** Its own handbook figures, only those given added (an inline ask's Save, lib/airplane). */
    figures: (id: number, figures: OwnFigures) =>
      gateway.PUT("/api/aircraft/{id}/figures", { params: { path: { id } }, body: figures }).then(data<Aircraft>),
    /** Its squawks, newest first; one written, changed or fixed, or taken out. */
    squawks: (id: number) => gateway.GET("/api/aircraft/{id}/squawks", { params: { path: { id } } }).then(data<Squawk[]>),
    addSquawk: (id: number, squawk: SquawkRequest) =>
      gateway.POST("/api/aircraft/{id}/squawks", { params: { path: { id } }, body: squawk }).then(data<Squawk>),
    updateSquawk: (id: number, squawkId: number, squawk: SquawkRequest) =>
      gateway.PUT("/api/aircraft/{id}/squawks/{squawkId}", { params: { path: { id, squawkId } }, body: squawk }).then(data<Squawk>),
    /** Its due items -- ADs and the owner's others -- added, changed or
     *  taken out; they come back with the airplane (dueItems). */
    addDueItem: (id: number, item: DueItemRequest) =>
      gateway.POST("/api/aircraft/{id}/due-items", { params: { path: { id } }, body: item }).then(data<DueItem>),
    updateDueItem: (id: number, itemId: number, item: DueItemRequest) =>
      gateway.PUT("/api/aircraft/{id}/due-items/{itemId}", { params: { path: { id, itemId } }, body: item }).then(data<DueItem>),
    removeDueItem: async (id: number, itemId: number): Promise<void> => {
      await gateway.DELETE("/api/aircraft/{id}/due-items/{itemId}", { params: { path: { id, itemId } } });
    },
    removeSquawk: async (id: number, squawkId: number): Promise<void> => {
      await gateway.DELETE("/api/aircraft/{id}/squawks/{squawkId}", { params: { path: { id, squawkId } } });
    },
  },
  /** A signed-in pilot's logbook and currency. */
  logbook: {
    list: () => gateway.GET("/api/logbook").then(data<LogbookEntry[]>),
    add: (request: LogbookEntryRequest) => gateway.POST("/api/logbook", { body: request }).then(data<LogbookEntry>),
    update: (id: number, request: LogbookEntryRequest) =>
      gateway.PUT("/api/logbook/{id}", { params: { path: { id } }, body: request }).then(data<LogbookEntry>),
    remove: async (id: number): Promise<void> => {
      await gateway.DELETE("/api/logbook/{id}", { params: { path: { id } } });
    },
    currency: () => gateway.GET("/api/logbook/currency").then(data<Currency>),
    setCurrencyDates: (request: CurrencyDatesRequest) => gateway.PUT("/api/logbook/currency", { body: request }).then(data<Currency>),
    /** Whether the pilot is emailed before their currency runs out. */
    reminders: () => gateway.GET("/api/logbook/reminders").then(data<Reminders>),
    setReminders: (on: boolean) => gateway.PUT("/api/logbook/reminders", { body: { on } }).then(data<Reminders>),
    /** Flights from a file, those already in the logbook left out. */
    importAll: (entries: Omit<LogbookEntryRequest, TrackColumns>[]) =>
      gateway
        .POST("/api/logbook/import", {
          // A file's flights were not drawn from a track (features/logbook-auto).
          body: { entries: entries.map((e) => ({ ...e, airHours: 0, touchAndGoes: 0, fromTrack: false, flightId: null })) },
        })
        .then(data<LogbookImportResult>),
  },

  /** What falls due for the pilot and their airplanes, soonest first, each
   *  with its rule (PaperworkController): the Logbook's Coming up. */
  paperwork: () => gateway.GET("/api/paperwork").then(data<Paperwork>),

  /** A student's way to the checkride, beside the logbook. */
  training: {
    get: () => gateway.GET("/api/training").then(data<Training>),
    setKnowledgeTest: (codes: string[]) => gateway.PUT("/api/training/knowledge-test", { body: { codes } }).then(data<Training>),
    endorse: (code: string, endorsedOn: string) =>
      gateway.PUT("/api/training/endorsements/{code}", { params: { path: { code } }, body: { endorsedOn } }).then(data<Training>),
    withdraw: (code: string) => gateway.DELETE("/api/training/endorsements/{code}", { params: { path: { code } } }).then(data<Training>),
    /** Their name as their certificate gives it, which endorsements use. */
    setName: (fullName: string) => gateway.PUT("/api/training/name", { body: { fullName } }).then(data<Training>),
    /** An instructor asked in by address, who is emailed. */
    askInstructor: (email: string) => gateway.POST("/api/training/instructors", { body: { email } }).then(data<Training>),
    dropInstructor: (id: number) => gateway.DELETE("/api/training/instructors/{id}", { params: { path: { id } } }).then(data<Training>),
    /** A saved flight put to an instructor for its solo cross-country review. */
    askReview: (body: { flightId: number; instructorId: number; makeModel: string; flightOn: string; note: string | null }) =>
      gateway.POST("/api/training/reviews", { body }).then(data<Training>),
    withdrawReview: (id: number) => gateway.DELETE("/api/training/reviews/{id}", { params: { path: { id } } }).then(data<Training>),
    /** How far along an approach set them: briefed, flown, its quiz so far. */
    lessonProgress: (id: number, body: LessonProgressRequest) =>
      gateway.POST("/api/training/lessons/{id}/progress", { params: { path: { id } }, body }).then(data<Training>),
  },

  /** The pilot as a flight instructor: their certificate, students,
   *  reviews and the endorsements they sign. */
  instructor: {
    get: () => gateway.GET("/api/instructor").then(data<Instructor>),
    set: (body: InstructorRequest) => gateway.PUT("/api/instructor", { body }).then(data<Instructor>),
    stop: () => gateway.DELETE("/api/instructor").then(data<Instructor>),
    accept: (linkId: number) =>
      gateway.POST("/api/instructor/students/{linkId}/accept", { params: { path: { linkId } } }).then(data<Instructor>),
    leave: (linkId: number) => gateway.DELETE("/api/instructor/students/{linkId}", { params: { path: { linkId } } }).then(data<Instructor>),
    student: (studentId: number) =>
      gateway.GET("/api/instructor/students/{studentId}/training", { params: { path: { studentId } } }).then(data<Training>),
    sign: (studentId: number, body: SignRequest) =>
      gateway.POST("/api/instructor/students/{studentId}/endorsements", { params: { path: { studentId } }, body }).then(data<Training>),
    voidEndorsement: (id: number) =>
      gateway.POST("/api/instructor/endorsements/{id}/void", { params: { path: { id } } }).then(data<Instructor>),
    decline: (id: number, note: string) =>
      gateway.POST("/api/instructor/reviews/{id}/decline", { params: { path: { id } }, body: { note } }).then(data<Instructor>),
    /** An approach set one of their students as a lesson, and taken back. */
    assignLesson: (studentId: number, body: AssignLessonRequest) =>
      gateway.POST("/api/instructor/students/{studentId}/lessons", { params: { path: { studentId } }, body }).then(data<Training>),
    removeLesson: (studentId: number, id: number) =>
      gateway.DELETE("/api/instructor/students/{studentId}/lessons/{id}", { params: { path: { studentId, id } } }).then(data<Training>),
    /** The track of a flight the student put to them, to debrief its approach. */
    reviewedTrack: (studentId: number, flightId: number) =>
      gateway
        .GET("/api/instructor/students/{studentId}/flights/{flightId}/track", { params: { path: { studentId, flightId } } })
        .then(data<SavedTrack>),
  },

  /** A signed-in pilot's own filed flights. */
  flights: {
    list: () => gateway.GET("/api/flights").then(data<FlightSummary[]>),
    save: (request: SaveFlightRequest) => gateway.POST("/api/flights", { body: request }).then(data<Flight>),
    remove: (id: number): Promise<void> => gateway.DELETE("/api/flights/{id}", { params: { path: { id } } }).then(() => undefined),
    /** Its name and notes changed: null keeps one, blank clears it. */
    update: (id: number, body: { name: string | null; notes: string | null }) =>
      gateway.PATCH("/api/flights/{id}", { params: { path: { id } }, body }).then(data<FlightSummary>),
    /** One flight with its nav log, for its debrief. */
    get: (id: number) => gateway.GET("/api/flights/{id}", { params: { path: { id } } }).then(data<Flight>),
    /** Its track as saved to the account, or null where none is. */
    track: (id: number): Promise<SavedTrack | null> =>
      gateway
        .GET("/api/flights/{id}/track", { params: { path: { id } } })
        .then(data<SavedTrack>)
        .catch((err) => {
          if (err instanceof ApiError && err.status === 404) return null;
          throw err;
        }),
    saveTrack: async (id: number, track: SavedTrack): Promise<void> => {
      await gateway.PUT("/api/flights/{id}/track", { params: { path: { id } }, body: track });
    },
    deleteTrack: (id: number): Promise<void> =>
      gateway.DELETE("/api/flights/{id}/track", { params: { path: { id } } }).then(() => undefined),
  },
};
