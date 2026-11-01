import type { ComponentPropsWithoutRef } from "react";

import { cn } from "./cn";

export function Table({ className, ...props }: ComponentPropsWithoutRef<"table">) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: ComponentPropsWithoutRef<"thead">) {
  return <thead className={cn("[&_tr]:border-b [&_tr]:border-line [&_tr]:hover:bg-transparent", className)} {...props} />;
}

export function TBody({ className, ...props }: ComponentPropsWithoutRef<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TR({ className, ...props }: ComponentPropsWithoutRef<"tr">) {
  return <tr className={cn("border-b border-line transition-colors duration-75 hover:bg-surface-2/70", className)} {...props} />;
}

type CellProps = { numeric?: boolean };

export function TH({ numeric, className, scope = "col", ...props }: ComponentPropsWithoutRef<"th"> & CellProps) {
  return (
    <th
      scope={scope}
      className={cn(
        "eyebrow h-9 px-3 align-middle font-normal whitespace-nowrap first:pl-4 last:pr-4",
        numeric ? "text-right" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ numeric, className, ...props }: ComponentPropsWithoutRef<"td"> & CellProps) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 align-middle text-ink first:pl-4 last:pr-4",
        numeric && "text-right font-mono text-[13px] whitespace-nowrap tabular-nums",
        className,
      )}
      {...props}
    />
  );
}
