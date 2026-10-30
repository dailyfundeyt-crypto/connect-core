import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import type * as React from "react";
import { cn } from "@/lib/utils";

function Tabs({
  className,
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-9 items-center justify-start rounded-xl bg-black/[0.04] p-1 text-muted-foreground",
        "dark:bg-white/[0.04] dark:text-[#a1a1aa]",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1 text-sm font-medium transition-all duration-150 outline-none",
        "text-[#71717a] hover:text-[#1c1b19] dark:text-[#71717a] dark:hover:text-[#ededef]",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
        "data-selected:bg-white data-selected:text-[#1c1b19] data-selected:shadow-sm",
        "dark:data-selected:bg-[#1e1e24] dark:data-selected:text-[#ededef] dark:data-selected:shadow-none",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(
        "flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
