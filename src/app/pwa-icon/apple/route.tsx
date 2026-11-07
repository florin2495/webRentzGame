import { renderIcon } from "@/lib/pwa-icon";

// apple-touch-icon, linked from layout metadata (Turbopack does not basePath-prefix apple-icon.tsx).
export function GET() {
  return renderIcon(180, 0.7);
}
