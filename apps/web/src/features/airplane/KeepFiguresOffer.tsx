import SheetDialog from "../../components/SheetDialog";
import { useKeepFiguresOffer } from "./useKeepFiguresOffer";

/** "Save N123AB's figures to your account?", once signed in, where this
 *  device kept figures the pilot set signed out (useKeepFiguresOffer). An
 *  alert, as any question over the page is (SheetDialog). */
export default function KeepFiguresOffer() {
  const vm = useKeepFiguresOffer();
  if (!vm.tail) return null;
  return (
    <SheetDialog
      open
      alert
      size="sm"
      onOpenChange={(open) => {
        if (!open) vm.decline();
      }}
      title={`Save ${vm.tail}'s figures to your account?`}
      description={vm.problem ?? `The figures you set for ${vm.tail} on this device, kept with your airplanes.`}
      action={{ label: vm.saving ? "Saving…" : "Save", onClick: () => void vm.keep(), disabled: vm.saving, testId: "keep-figures-save" }}
      testId="keep-figures-offer"
    />
  );
}
