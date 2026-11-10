"use client";

import { cn } from "cn";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  thumb,
  ...props
}: SliderPrimitive.Root.Props & {
  /** What each thumb -- the element that is the slider, role=slider --
   *  is to say: its name and its value in words (aria-label,
   *  getAriaValueText), which the stock component had no way to give it.
   *  (Added to shadcn's slider: the dry run's scrubber says its miles,
   *  feet and knots.) */
  thumb?: SliderPrimitive.Thumb.Props;
}) {
  const _values = Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max];

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-muted select-none data-horizontal:h-1.5 data-horizontal:w-full data-vertical:h-full data-vertical:w-1.5"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            index={index}
            {...thumb}
            className={cn(
              "block size-4 shrink-0 rounded-full border border-primary bg-white shadow-sm ring-ring transition-[color,box-shadow] select-none hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden data-disabled:pointer-events-none data-disabled:opacity-50",
              typeof thumb?.className === "string" ? thumb.className : undefined,
            )}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
