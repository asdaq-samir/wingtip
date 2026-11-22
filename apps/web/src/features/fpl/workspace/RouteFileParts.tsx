import type { ReactNode } from "react";
import { FileTrigger } from "react-aria-components";
import { Pressable } from "react-aria/Pressable";
import FileDrop from "../../../components/FileDrop";
import { OpenRouteFileRow } from "../../procedures";
import { openRouteFile, ROUTE_FILE_ENDINGS, ROUTE_FILE_TYPES } from "../../shared-flight";

/*
 * The empty route's file parts, on a chunk of their own (RouteStart):
 * React Aria's DropZone and FileTrigger bring its press and drag code with
 * them, about 160 KB, which put the first load over its 1.10 MB budget
 * (scripts/first-load.mjs, 1.21 MB on 2026-11-22) when they sat in FPL's
 * first screen.
 */

/** The empty route's card as a drop target for a route file (an iPad's
 *  Files beside the app, a desktop's Finder): read and previewed before
 *  it is used (features/shared-flight), as a shared flight is. */
export function RouteFileDrop({ children }: { children: ReactNode }) {
  return (
    <FileDrop
      label="Drop a route file (.fpl or .gpx) to preview it"
      types={ROUTE_FILE_TYPES}
      extensions={ROUTE_FILE_ENDINGS}
      onFiles={(files) => void openRouteFile(files[0]!)}
    >
      {children}
    </FileDrop>
  );
}

/** A route file opened from the empty route: React Aria's FileTrigger, the
 *  device's own picker, with the timeline's row as its pressable child
 *  (Pressable), as Documents' Add a PDF is: a FileTrigger with none warned
 *  "A PressResponder was rendered without a pressable child". */
export function OpenFileRow() {
  return (
    <FileTrigger
      acceptedFileTypes={[...ROUTE_FILE_TYPES, ...ROUTE_FILE_ENDINGS]}
      onSelect={(files) => files?.[0] && void openRouteFile(files[0])}
      data-testid="route-file-input"
    >
      <Pressable>
        <OpenRouteFileRow />
      </Pressable>
    </FileTrigger>
  );
}
