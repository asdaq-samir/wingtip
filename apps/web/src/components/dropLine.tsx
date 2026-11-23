import { DropIndicator, type DropTarget } from "react-aria-components";
import { cn } from "cn";

/** The stock line between a reordered list's rows where the one carried
 *  will land (React Aria's DropIndicator, the owner's pick of the line
 *  over a ring round a row): FPL's route list and Favorites' rows draw
 *  the same one, so a drag reads alike in both. */
export function dropLine(target: DropTarget) {
  return (
    <DropIndicator
      target={target}
      className={({ isDropTarget }) => cn("-my-px h-0.5 rounded-full outline-none", isDropTarget ? "bg-tint" : "bg-transparent")}
    />
  );
}
