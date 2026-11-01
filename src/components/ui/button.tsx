import Link from "next/link";
import type { ComponentProps, ComponentPropsWithoutRef } from "react";

import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-bold select-none " +
  "transition-[background-color,box-shadow,color] duration-100 active:translate-y-px " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 " +
  "[&_svg]:size-4 [&_svg]:shrink-0";

const VARIANTS: Record<ButtonVariant, string> = {
  // Hover mischt Richtung Tinte: hell → dunkler, dunkel → heller. Ein Token, beide Modi.
  primary: "bg-accent text-accent-ink hover:bg-[color-mix(in_oklab,var(--color-accent),var(--color-ink)_12%)]",
  secondary: "bg-surface-2 text-ink hover:bg-[color-mix(in_oklab,var(--color-surface-2),var(--color-ink)_7%)]",
  ghost: "text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-surface-2",
  danger: "bg-danger-soft text-danger hover:bg-[color-mix(in_oklab,var(--color-danger-soft),var(--color-danger)_14%)]",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3.5 text-[13px]",
  md: "h-10 px-[18px] text-sm",
  lg: "h-12 px-[22px] text-[15px]",
};

export function buttonClasses(opts: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(BASE, VARIANTS[opts.variant ?? "secondary"], SIZES[opts.size ?? "md"], opts.className);
}

export type ButtonProps = ComponentPropsWithoutRef<"button"> & { variant?: ButtonVariant; size?: ButtonSize };

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}

export type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize };

export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses({ variant, size, className })} {...props} />;
}
