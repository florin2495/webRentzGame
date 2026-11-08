import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rentz",
    short_name: "Rentz",
    description: "Rentz clasic, în 3 până la 6 prieteni, pe telefon.",
    id: "/rentz/",
    start_url: "/rentz/",
    // "/" on purpose: going back to the hub (same origin) stays inside the installed app.
    scope: "/",
    display: "standalone",
    lang: "ro",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      { src: "/rentz/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/rentz/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/rentz/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
