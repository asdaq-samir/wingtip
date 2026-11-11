import { Mic } from "lucide-react";
import { cn } from "cn";
import { Toggle } from "../../components/ui/toggle";
import { useVoiceInput } from "./voiceStore";

/**
 * The microphone beside a field, the way a phone's dictation is shown:
 * Base UI's Toggle, pressed while it listens -- its stock pressed look,
 * nothing that moves -- and the words appearing in the field itself
 * (useVoice). The radio's listening has its own mark and place (Comms
 * assist, RadioButton); this is the pilot's own voice only (the owner,
 * 2026-11-10).
 */
export default function VoiceButton({
  field,
  label,
  onPress,
  className,
  testId,
}: {
  /** The field it speaks into, as useVoice was given it. */
  field: string;
  /** What it does, idle: "Search by voice", "Ask by voice". */
  label: string;
  onPress: () => void;
  className?: string;
  testId?: string;
}) {
  const listening = useVoiceInput((s) => s.field === field);
  return (
    <Toggle
      aria-label={label}
      pressed={listening}
      onPressedChange={onPress}
      data-testid={testId}
      className={cn("shrink-0 rounded-full text-tint", className)}
    >
      <Mic className="size-5" strokeWidth={2.2} aria-hidden="true" />
    </Toggle>
  );
}
