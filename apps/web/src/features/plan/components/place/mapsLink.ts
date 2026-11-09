import type { AirportPlace } from "../../../../lib/api/types";

/** The field in Maps -- Apple's, which a phone opens in its Maps app --
 *  by its street address where the FAA lists one, so Maps names the
 *  road a driver is taken to, and by where it is otherwise; its name the
 *  pin's either way (PlaceCard's Address action, its Info tab's row). */
export function mapsLink(place: AirportPlace): string {
  const where = place.address
    ? `address=${encodeURIComponent(place.address)}`
    : `ll=${place.lat.toFixed(5)},${place.lon.toFixed(5)}`;
  return `https://maps.apple.com/?q=${encodeURIComponent(place.name)}&${where}`;
}
