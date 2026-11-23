package app.wingtipmaps.android.api

import app.wingtipmaps.android.api.generated.gateway.FlightPlanFilingRequest
import app.wingtipmaps.android.api.generated.gateway.FlightServiceStatus

// Filing with Flight Service through the gateway (FlightServiceController),
// as the web's Brief and the iPhone's FlightServiceView file: whether it is
// connected here, and a form filed in the pilot's name. Signed in only.

/** Whether filing is connected on the gateway, and with whom; null signed out. */
suspend fun Gateway.flightService(): FlightServiceStatus? = api.status().readOrNone()

/** The form filed (POST /api/flight-service/flight-plans): Flight
 *  Service's reference for it, or its refusal in the gateway's words. */
suspend fun Gateway.file(plan: FlightPlanFilingRequest): String = writes.file(plan).accepted().reference
