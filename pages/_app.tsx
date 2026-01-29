import type { AppProps } from "next/app";
import "../styles/globals.css";
import "../styles/fullcalendar-ew.css";
import { Analytics } from "@vercel/analytics/next";
import "@fullcalendar/common/main.css";
import "@fullcalendar/daygrid/main.css";
import "@fullcalendar/timegrid/main.css";
import "@fullcalendar/list/main.css";


export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <Analytics />
    </>
  );
}
