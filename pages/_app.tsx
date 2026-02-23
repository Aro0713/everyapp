import type { AppProps } from "next/app";
import "../styles/globals.css";
import "../styles/fullcalendar-base.css";
import "../styles/fullcalendar-ew.css";
import { Analytics } from "@vercel/analytics/next";
import "maplibre-gl/dist/maplibre-gl.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <Analytics />
    </>
  );
}
