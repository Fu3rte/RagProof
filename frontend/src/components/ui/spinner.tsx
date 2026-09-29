import * as React from "react"
import { cn } from "cn"
import { RiLoaderLine } from "@remixicon/react"

function Spinner({ className, ...props }: Omit<React.ComponentProps<"svg">, "children">) {
  return (
    <RiLoaderLine
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn("animate-spin size-4", className)}
      {...props}
    />
  )
}

export { Spinner }
