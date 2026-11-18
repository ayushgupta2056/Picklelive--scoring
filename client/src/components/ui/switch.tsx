import * as React from "react";
import * as S from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({ className, label, ...props }: React.ComponentPropsWithoutRef<typeof S.Root> & { label?: string }) {
  const id = React.useId();
  return (
    <div className="flex min-h-12 items-center gap-3">
      <S.Root
        id={id}
        className={cn("peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=unchecked]:bg-input", className)}
        {...props}
      >
        <S.Thumb className="pointer-events-none block h-6 w-6 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
      </S.Root>
      {label && <label htmlFor={id} className="text-sm font-medium">{label}</label>}
    </div>
  );
}
