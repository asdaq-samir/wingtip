import { CircleAlert } from "lucide-react";
import MapBanner, { BannerButton } from "./MapBanner";
import { useSystemProblems } from "../lib/problems";
import { WORDING } from "../lib/wording/generated/wording";

/**
 * What the app could not do that is not the pilot's doing -- the planner
 * or a service out, a download that failed (lib/problems) -- as one line
 * on the map, beside its buttons and level with them (MapBanners), the
 * map's one banner (MapBanner) in the warning's red: the problem, or how
 * many there are, and Try again where asking again could help. A tap on
 * the words shows all of it. It goes when what caused it has, and sits in
 * the map's own layer, under the panel: nothing of the panel or its
 * grabber is ever under it. It was a toast per problem, a stack of them
 * folded to lines the panel had to stop short of.
 */
export default function ProblemBanner() {
  const problems = useSystemProblems((s) => s.problems);
  if (problems.length === 0) return null;
  const retries = problems.filter((p) => p.retry);
  const title = problems.length === 1 ? problems[0]!.title : `${problems.length} problems`;
  return (
    <MapBanner
      data-problem-banner=""
      className="appear"
      icon={CircleAlert}
      tone="warning"
      title={title}
      // The line is the message: two lines before it is cut, so "Part of
      // the map could not be drawn" reads whole beside Try Again at the
      // owner's larger text on an iPad held upright, where it lost 75
      // points.
      lines={2}
      titleTestId="problem-banner-title"
      more={
        problems.length > 1 && (
          <ul className="list-disc pl-4">
            {problems.map((p) => (
              <li key={p.id} data-problem-item="">
                {p.title}
              </li>
            ))}
          </ul>
        )
      }
      actions={retries.length > 0 && <BannerButton onClick={() => retries.forEach((p) => p.retry!())}>{WORDING.tryAgain}</BannerButton>}
    />
  );
}
