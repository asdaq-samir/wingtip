import StatusBadge from "../../../../components/StatusBadge";

/** A flight category as the app's status badge, filled in the category's
 *  chip colour under white words, as the Nearest list and a place's card
 *  show it (AIM 7-1-7). */
export default function CategoryBadge({ category }: { category: string | null | undefined }) {
  if (!category) return null;
  return <StatusBadge category={category} />;
}
