import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@dailyfun/lib/utils"

const buttonVariants = cva(
  "glass-button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-all duration-200 ease-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary/80 text-primary-foreground backdrop-blur-md border-primary/30 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 active:scale-95",
        destructive:
          "bg-destructive/80 text-destructive-foreground backdrop-blur-md border-destructive/30 hover:bg-destructive/90 hover:shadow-lg hover:shadow-destructive/20 active:scale-95",
        outline:
          "glass border-border/30 hover:bg-accent/20 hover:text-accent-foreground active:scale-95",
        secondary:
          "glass bg-secondary/40 text-secondary-foreground hover:bg-secondary/60 active:scale-95",
        ghost: "bg-transparent border-transparent shadow-none hover:bg-accent/20 hover:text-accent-foreground hover:backdrop-blur-sm active:scale-95",
        link: "text-primary underline-offset-4 hover:underline bg-transparent border-transparent shadow-none active:scale-95",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 rounded-xl px-3.5",
        lg: "h-11 rounded-xl px-8",
        icon: "h-10 w-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
