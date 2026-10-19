// Single-file icon set so the multiposter modules don't pull in two copies of
// lucide-react. Each export mirrors the lucide-react component shape.

import {
  ArrowLeft,
  Camera,
  Check,
  Eye,
  EyeOff,
  Globe,
  ImageUp,
  LogOut,
  Moon,
  PlugZap,
  Settings,
  ShoppingCart,
  Sparkles,
  Sun,
  Trash2,
  X,
} from "lucide-react"

export {
  ArrowLeft,
  Camera,
  Check,
  Eye,
  EyeOff,
  Globe,
  ImageUp,
  LogOut,
  Moon,
  PlugZap,
  Settings,
  ShoppingCart,
  Sparkles,
  Sun,
  Trash2,
  X,
}

export function SheetIcon({ size = 16 }: { size?: number } = {}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  )
}
