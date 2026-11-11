import { divIcon, made } from "../../lib/map/marks/icons";
import { CHART } from "../../lib/tokens";
import type { TagView } from "./plateTags";

const esc = (text: string) => text.replace(/[<>&"]/g, "");

/** A fix's tag over its plate (TagView): a dark chip above the fix, so
 *  the procedure's own diamond and its words beside it stay clear; its
 *  name, then each line, an altitude barred as the plate bars it. Drawn
 *  under the finger's taps (pointer-events none), so a tap on it is the
 *  plate's or the fix's beneath. */
export const plateTagIcon = made(function plateTagIcon(tag: Pick<TagView, "ident" | "lines">) {
  const lines = tag.lines
    .map((l) => {
      const bar = [l.under && "underline", l.over && "overline"].filter(Boolean).join(" ") || "none";
      return `<span style="text-decoration:${bar};text-decoration-thickness:1.5px">${esc(l.text)}</span>`;
    })
    .join("");
  return divIcon({
    className: "",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html:
      `<span class="pointer-events-none absolute bottom-[14px] left-0 flex -translate-x-1/2 flex-col items-center rounded-md px-1.5 py-0.5 text-(length:--type-note) leading-4 font-bold whitespace-nowrap shadow-sm" style="background:${CHART.tag};color:${CHART.casing}" data-plate-tag="${esc(tag.ident)}">` +
      `<span>${esc(tag.ident)}</span>${lines}</span>`,
  });
});
