import type { NextApiRequest, NextApiResponse } from "next";
import { exec } from "child_process";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false });
  }

  const { source } = req.body;

  const cmd = source
    ? `npx tsx crawler/src/jobs/backfillExternalPhones.ts ${source}`
    : `npx tsx crawler/src/jobs/backfillExternalPhones.ts`;

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error("PHONE_BACKFILL_ERROR", err);
    }

    console.log(stdout);
    console.error(stderr);
  });

  return res.json({ ok: true });
}