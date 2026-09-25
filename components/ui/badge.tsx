import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "border-transparent bg-muted text-muted-foreground",
      blue: "border-transparent bg-blue-500/12 text-blue-700 dark:text-blue-300",
      green: "border-transparent bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
      amber: "border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300",
      red: "border-transparent bg-red-500/12 text-red-700 dark:text-red-300",
      violet: "border-transparent bg-violet-500/12 text-violet-700 dark:text-violet-300",
      outline: "text-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
