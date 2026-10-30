import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,translate,opacity] duration-150 ease-out outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-[#f4f4f5] dark:text-[#09090b] dark:hover:bg-white dark:hover:shadow-[0_0_16px_rgba(255,255,255,0.12)]",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-white/10 dark:bg-white/[0.03] dark:text-[#ededef] dark:hover:bg-white/[0.06] dark:hover:border-white/20",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground dark:bg-white/[0.06] dark:text-[#ededef] dark:hover:bg-white/[0.1]",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:text-[#a1a1aa] dark:hover:bg-white/[0.06] dark:hover:text-[#ededef]",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 dark:focus-visible:ring-red-500/40",
        link: "text-primary underline-offset-4 hover:underline dark:text-sky-400 dark:hover:text-sky-300",
      },
      size: {
        default:
          "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  render,
  /*
   * DIVERGES FROM UPSTREAM SHADCN. Base UI defaults `nativeButton` to `true`, which is right only
   * while the element really is a `<button>`. Six call sites here draw a router `Link` through
   * `render` instead — "New skill", "New agent", the sidebar's new-channel control, the two
   * empty-state returns, and `PageShell`'s back button, which is five routes in every state each of
   * them has — and every one of them warned at render that it had been told to expect a native
   * button and found an anchor. It was not only noise: Base UI was putting `type="button"` on an
   * anchor, which means nothing there, and withholding the `role="button"` and Space-to-activate
   * handling a non-button needs in order to behave like one.
   *
   * Replacing the element is exactly the case where the default is wrong, so the default follows
   * `render`, once here rather than at every call site. Passing `render` is not proof the result is
   * a non-button, only that we can no longer assume it is one, so a call site drawing a real
   * `<button>` through `render` passes `nativeButton` back explicitly — `combobox.tsx` is the one
   * that does.
   */
  nativeButton = render === undefined,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      nativeButton={nativeButton}
      render={render}
      {...props}
    />
  );
}

export { Button, buttonVariants };
