import { useId } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";
import { FormDateField } from "../../components/FormFields";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import FieldHit from "../../components/FieldHit";
import RowField from "../../components/RowField";
import { invalidProps } from "../../lib/fieldError";
import { ListGroup, ListRow } from "../../components/GroupedList";
import Segmented from "../../components/Segmented";
import { Input } from "../../components/ui/input";
import { api } from "../../lib/api/client";
import { z } from "./formSchema";
import type { Instructor, InstructorRequest } from "../../lib/api/types";
import { FINDING_TONE } from "../../lib/findings";
import { TEXT } from "../../lib/text";
import { FieldError } from "../../components/ui/field";

// As the server checks the certificate (InstructorRequest.java): the name
// as the FAA prints it, at most 120 characters, and the number with its
// ratings' letters, 4 to 20 letters and figures ("987654321CFI"). Its date
// may be gone by: a run-out instructor is warned, never stopped (the
// owner's rule, 2026-10-26).
const certificateSchema = z.object({
  fullName: z.string().trim().min(1, "Your name is required").max(120, "At most 120 characters"),
  certificate: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{4,20}$/, "4 to 20 letters and figures, as 987654321CFI"),
  until: z.string().min(1, "The date is required"),
  untilKind: z.enum(["RE", "EXP"]),
});
type CertificateValues = z.infer<typeof certificateSchema>;

/** The certificate as endorsements print it, given or changed. */
export function CertificateForm({ instructor, onDone }: { instructor: Instructor; onDone?: () => void }) {
  const queryClient = useQueryClient();
  const ids = { name: useId(), number: useId(), until: useId() };
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CertificateValues>({
    resolver: zodResolver(certificateSchema),
    defaultValues: {
      fullName: instructor.fullName ?? "",
      certificate: instructor.certificate ?? "",
      until: instructor.until ?? "",
      untilKind: instructor.untilKind ?? "RE",
    },
  });
  const untilKind = useWatch({ control, name: "untilKind" });
  const save = useMutation({
    mutationFn: (request: InstructorRequest) => api.instructor.set(request),
    onSuccess: (next) => {
      queryClient.setQueryData(["instructor"], next);
      onDone?.();
    },
  });
  const onSave = handleSubmit((values) =>
    save.mutate({
      fullName: values.fullName.trim(),
      certificate: values.certificate.trim(),
      until: values.until,
      untilKind: values.untilKind,
    }),
  );
  return (
    <>
      {/* As every endorsement signed carries it (AC 61-65K): the name, the
          certificate number with its ratings' letters, and the end of the
          recent experience (14 CFR 61.197(a)) for a certificate issued on or
          after 1 Dec 2024, which has no expiration date (61.19(d)(1)), or an
          older certificate's expiration date (61.19(d)(2)). */}
      <ListGroup title="Your flight instructor certificate">
        <ListRow id={ids.name} title="Name">
          <RowField id={ids.name} error={errors.fullName?.message}>
            <FieldHit htmlFor={ids.name}>
              <Input
                id={ids.name}
                {...register("fullName")}
                placeholder="J. J. Jones"
                maxLength={120}
                // The return key moves on, the name AutoFill's own (the iOS
                // audit's P19).
                autoComplete="name"
                enterKeyHint="next"
                className="h-8 w-44 sm:w-56"
                {...invalidProps(ids.name, errors.fullName?.message)}
                data-testid="cfi-name"
              />
            </FieldHit>
          </RowField>
        </ListRow>
        <ListRow id={ids.number} title="Certificate">
          <RowField id={ids.number} error={errors.certificate?.message}>
            <FieldHit htmlFor={ids.number}>
              <Input
                id={ids.number}
                {...register("certificate")}
                placeholder="987654321CFI"
                maxLength={20}
                autoComplete="off"
                enterKeyHint="done"
                className="h-8 w-44 font-mono sm:w-56"
                autoCapitalize="characters"
                {...invalidProps(ids.number, errors.certificate?.message)}
                data-testid="cfi-number"
              />
            </FieldHit>
          </RowField>
        </ListRow>
        <ListRow title="Its date">
          <Controller
            control={control}
            name="untilKind"
            render={({ field }) => (
              <Segmented
                label="What the date is"
                value={field.value}
                onChange={(v) => field.onChange(v as CertificateValues["untilKind"])}
                options={[
                  { value: "RE", label: "Recent experience" },
                  { value: "EXP", label: "Expires" },
                ]}
                testId="cfi-until-kind"
              />
            )}
          />
        </ListRow>
        <ListRow id={ids.until} title={untilKind === "RE" ? "Recent experience through" : "Certificate expires"}>
          <RowField id={ids.until} error={errors.until?.message}>
            <FormDateField
              control={control}
              name="until"
              id={ids.until}
              aria-label={untilKind === "RE" ? "Recent experience through" : "Certificate expires"}
              className="h-8 w-40"
              error={errors.until?.message}
              data-testid="cfi-until"
            />
          </RowField>
        </ListRow>
        <ListRow
          title={<span className="font-medium text-tint">Save</span>}
          disabled={save.isPending}
          onClick={() => void onSave()}
          data-testid="cfi-save"
        />
        {onDone && <ListRow title="Cancel" onClick={onDone} />}
      </ListGroup>
      {save.error && <FieldError className={cn("px-1", FINDING_TONE.stop, TEXT.prose)}>{save.error.message}</FieldError>}
    </>
  );
}
