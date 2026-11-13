import { planner, data, ndjson } from "./http";
import type {
  ChartRefreshStarted,
  Classification,
  DevServices,
  DevServiceStarted,
  ModelComparison,
  PickDeleted,
  PickSaved,
  Rating,
  RetrainStarted,
  Role,
  Status,
  StreamMessage,
} from "./types";

/** The planner's calls for the developer (./client's `api`): the console's
 *  services and status, the chart model's training and its labels. */
export const plannerDev = {
  /** Which of the services the developer console links to are
   *  running, and whether starting one is possible here at all. */
  devServices: () => planner.GET("/api/dev/services").then(data<DevServices>),

  /** Start one, if it is not already up. Already running is a success:
   *  the console asks on every click so the link always works. */
  startDevService: (service: string) =>
    planner.POST("/api/dev/services/{service}/start", { params: { path: { service } } }).then(data<DevServiceStarted>),
  /** The whole stack in one snapshot -- the developer console. */
  status: () => planner.GET("/api/status").then(data<Status>),

  /** Starts the training run (`python -m wingtip.pipeline run`); 501
   *  with the command to run by hand where the planner cannot start it,
   *  409 while a run is going. */
  retrain: () => planner.POST("/api/retrain").then(data<RetrainStarted>),

  /** Fetch and render the FAA's current chart cycle now, in the
   *  planner's own background subprocess (it also does this daily). */
  refreshCharts: () => planner.POST("/api/charts/refresh").then(data<ChartRefreshStarted>),
  /** What the chart draws at a point, so an added pick is categorised from
   *  the pixels rather than from whatever a dropdown was left on. */
  classify: (lat: number, lon: number) => planner.GET("/api/classify", { params: { query: { lat, lon } } }).then(data<Classification>),

  savePick: (pick: {
    departure_ident: string;
    destination_ident: string;
    lat: number;
    lon: number;
    source: "detected" | "added";
    category: string;
    role?: Role;
    rating: Rating | null;
    area_m2?: number | null;
  }) => planner.POST("/api/picks", { body: pick }).then(data<PickSaved>),

  deletePick: (dep: string, dest: string, lat: number, lon: number) =>
    planner.DELETE("/api/picks", { params: { query: { dep, dest, lat, lon } } }).then(data<PickDeleted>),

  /**
   * Detections, streamed a block at a time from the departure end, so
   * the map fills where the work starts while the rest is still being
   * read.
   */
  async *detect(dep: string, dest: string, signal?: AbortSignal): AsyncGenerator<StreamMessage> {
    const result = await planner.GET("/api/detect/stream", { params: { query: { dep, dest } }, parseAs: "stream", signal });
    yield* ndjson<StreamMessage>(result.data as ReadableStream | undefined);
  },
  /** How the currently promoted model was actually chosen -- every
   *  algorithm retrain() tried, not just the winner. */
  modelComparison: () => planner.GET("/api/model-comparison").then(data<ModelComparison>),
};
