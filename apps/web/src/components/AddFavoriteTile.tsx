import { Plus } from "lucide-react";
import PullDown from "./PullDown";
import { SmallMark, SmallTile } from "./Favorites";

/** The one Add at the end of a row of Favorites, as Apple Maps' has: the
 *  stock menu offers what to add (`choices`), each choice the add its own
 *  tile used to start. */
export default function AddFavoriteTile({
  choices,
  testId,
}: {
  choices: { value: string; label: string; testId: string; onPick: () => void }[];
  testId: string;
}) {
  return (
    <PullDown
      label="Add a Favorite"
      value=""
      align="start"
      options={choices.map(({ value, label, testId: id }) => ({ value, label, testId: id }))}
      onChange={(v) => choices.find((c) => c.value === v)?.onPick()}
      trigger={
        <SmallTile
          mark={<SmallMark icon={<Plus />} className="bg-foreground/8 text-tint" />}
          title="Add"
          label="Add a Favorite"
          onClick={() => {}}
          testId={testId}
        />
      }
    />
  );
}
