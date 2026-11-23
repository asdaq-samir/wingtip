import { Suspense, type ComponentProps } from "react";
import { AirportSectionsChunk } from "./airportSectionsChunk";

/** The Brief's airport sections (AirportSections, airportSectionsChunk),
 *  nothing in their place for the moment their chunk is still coming. */
export default function AirportSectionsPart(props: ComponentProps<typeof AirportSectionsChunk>) {
  return (
    <Suspense fallback={null}>
      <AirportSectionsChunk {...props} />
    </Suspense>
  );
}
