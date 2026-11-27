import { useRef } from "react";
import { FileUp, Unlink } from "lucide-react";
import { FileTrigger } from "react-aria-components";
import { Pressable } from "react-aria/Pressable";
import { ListGroup, ListRow } from "../../components/GroupedList";
import RowMenu from "../../components/RowMenu";
import { usePoh } from "./usePoh";

/** What a POH is taken as: a PDF, as the library takes the pilot's own. */
const PDF_TYPES = ["application/pdf", ".pdf"];

/**
 * An airplane's POH on its card (AirplaneCard's Figures, else its Info):
 * linked, its row opens it in the reader, and its menu changes it for
 * another PDF or unlinks it; not linked, Add Your POH picks a PDF from the
 * device, kept in Your Documents and linked to this N-number. Under it,
 * where the model is known, the choice to use it for every airplane of
 * that model. Its view model is usePoh.
 */
export default function PohRow({ tail, model }: { tail: string; model: string | null }) {
  const vm = usePoh(tail, model);
  // Change opens the same picker from the row's menu, by its hidden input.
  const picker = useRef<HTMLInputElement>(null);
  const onSelect = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void vm.add(file);
  };
  return (
    <ListGroup>
      {vm.doc ? (
        <>
          <FileTrigger ref={picker} acceptedFileTypes={PDF_TYPES} onSelect={onSelect} />
          <RowMenu
            label="More for POH"
            testId="airplane-poh-more"
            actions={[
              { label: "Change", icon: <FileUp />, onSelect: () => picker.current?.click(), testId: "airplane-poh-change" },
              {
                label: "Unlink",
                icon: <Unlink />,
                destructive: true,
                onSelect: vm.unlink,
                spoken: "Unlink the POH",
                testId: "airplane-poh-unlink",
              },
            ]}
          >
            <ListRow title="POH" value={vm.doc.name} chevron onClick={vm.open} data-testid="airplane-poh" />
          </RowMenu>
        </>
      ) : (
        // React Aria's FileTrigger: the device's own file picker, PDFs only, opened by the row.
        <FileTrigger acceptedFileTypes={PDF_TYPES} onSelect={onSelect}>
          <Pressable>
            <ListRow title="Add Your POH" chevron data-testid="airplane-poh-add" />
          </Pressable>
        </FileTrigger>
      )}
      {model && (
        <ListRow
          title={`Use for All ${model}`}
          checkbox={{ checked: vm.forModel, onChange: vm.setForModel }}
          data-testid="airplane-poh-all"
        />
      )}
    </ListGroup>
  );
}
