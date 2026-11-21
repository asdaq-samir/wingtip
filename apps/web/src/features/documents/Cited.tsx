import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { useAddressKey } from "../../lib/address";
import { callEngine, engineLoaded } from "../../lib/engine/engine";
import { citedPlace, docPlaceText } from "./docPlace";
import { libraryQuery } from "./shelfQuery";

/** A link's hit area, 44 points tall round words in a line (CLAUDE.md:
 *  controls never grow to get there). */
const LINK = "relative font-[inherit] after:absolute after:-inset-x-1 after:-inset-y-3";

/**
 * Words as the app shows them, each cited rule among them a tap that
 * opens the documents library at its paragraph: "14 CFR 91.155" at
 * § 91.155 of Part 91, "AIM 7-1-5" at its paragraph. Where each rule
 * lives is the engine's to say (its `citations`), and a link is drawn only
 * where the shelf holds the document; elsewhere, and until the engine and
 * the shelf are in, the words as they are.
 */
export function Cited({ text, className }: { text: string; className?: string }) {
  const { data: shelf } = useQuery(libraryQuery);
  const [, setDoc] = useAddressKey("doc");
  const pieces = engineLoaded() && shelf ? callEngine("citations", { text }).pieces : null;
  if (!pieces) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {pieces.map((p, i) => {
        const place = p.cite ? citedPlace(p.cite, shelf?.documents) : null;
        return place ? (
          <Button
            key={i}
            variant="link"
            size="inline"
            className={cn(LINK, "align-baseline")}
            onClick={() => void setDoc(docPlaceText(place), { history: "push" })}
            data-testid="cite-link"
          >
            {p.text}
          </Button>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        );
      })}
    </span>
  );
}
