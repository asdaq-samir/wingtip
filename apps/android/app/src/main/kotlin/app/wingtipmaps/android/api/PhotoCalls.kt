package app.wingtipmaps.android.api

import app.wingtipmaps.android.api.generated.AirportPhotos

// A field's pictures for its card's carousel: the planner's list of them
// (its USGS aerial, every US field's, and its Wikipedia photo where there
// is a free one). Each picture's bytes are Coil's to fetch
// (ui/PhotoCarousel, on the app's OkHttp client).

/** A field's pictures (/api/airport/{ident}/photos). */
suspend fun Planner.airportPhotos(ident: String): AirportPhotos =
    api.airportPhotosOf(ident).planned()
