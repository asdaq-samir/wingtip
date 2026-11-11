import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cn } from "cn";
import { CardAction } from "./CardAction";
import { ACTION } from "../lib/cardActions";
import { FAVORITE_STAR_ON } from "../lib/mapChrome";

/**
 * A card's Favorite, its action row's last tile, an airport's and an
 * airplane's alike (the owner, 2026-11-11: "replace address button with
 * favorite. This way all the cards have at most two head buttons"): the
 * thing in the Favorites or out, a switch (Base UI's Toggle), its star
 * filled in iOS's yellow and pressed while it is one.
 */
export function FavoriteTile({ on, disabled, onToggle, testId }: { on: boolean; disabled: boolean; onToggle: () => void; testId: string }) {
  return (
    <TogglePrimitive
      pressed={on}
      disabled={disabled}
      onPressedChange={onToggle}
      render={
        <CardAction
          icon={<ACTION.favorite.icon className={cn(on && FAVORITE_STAR_ON)} />}
          label={ACTION.favorite.label}
          pressed={on}
          spoken={on ? "Remove from Favorites" : "Add to Favorites"}
          testId={testId}
        />
      }
    />
  );
}
