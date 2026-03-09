import type { NextApiRequest, NextApiResponse } from "next";
import { exec } from "child_process";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false });
  }

  const script =
    'powershell -ExecutionPolicy Bypass -File "C:\\Users\\a4pem\\everyapp-app\\crawler\\run-backfill-external-phones.ps1"';

  exec(script, (err, stdout, stderr) => {
    if (err) {
      console.error("CRAWLER_START_ERROR", err);
      return;
    }

    console.log(stdout);
    console.error(stderr);
  });

  return res.json({
    ok: true,
    message: "Crawler started"
  });
}