import { data, planner } from "../../../lib/api/client";
import type { ForecastRun, ForecastRunAsk } from "../../../lib/api/types";

/** The dry run played against the forecast for the hours it flies (POST
 *  /api/forecast/run: wingtip.forecast_run, the engine's forecast_run). */
export const forecastRun = (body: ForecastRunAsk) => planner.POST("/api/forecast/run", { body }).then(data<ForecastRun>);
