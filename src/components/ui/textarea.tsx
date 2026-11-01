import type { ComponentPropsWithoutRef } from "react";

import { cn } from "./cn";
import { controlClasses } from "./input";

export type TextareaProps = ComponentPropsWithoutRef<"textarea">;

export function Textarea({ className, rows = 4, ...props }: TextareaProps) {
  return <textarea rows={rows} className={cn(controlClasses, "min-h-24 px-3.5 py-3 leading-relaxed", className)} {...props} />;
}
