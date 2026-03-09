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

  const command =
    'powershell -ExecutionPolicy Bypass -Command "cd C:\\Users\\a4pem\\everyapp-app\\crawler; npx tsx src/jobs/backfillExternalPhones.ts"';

  exec(command, (err, stdout, stderr) => {

    if (err) {
      console.error("CRAWLER_START_ERROR", err);

      return res.status(500).json({
        ok: false,
        error: "CRAWLER_START_FAILED"
      });
    }

    console.log(stdout);
    console.error(stderr);

    return res.json({
      ok: true,
      message: "Crawler started"
    });
  });
}