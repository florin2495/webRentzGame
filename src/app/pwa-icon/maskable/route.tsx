import { renderIcon } from "@/lib/pwa-icon";

// Artwork stays well inside the central 80% safe zone.
export function GET() {
  return renderIcon(512, 0.56);
}
