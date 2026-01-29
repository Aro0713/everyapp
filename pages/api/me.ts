import type { NextApiRequest, NextApiResponse } from "next";
import { getUserIdFromRequest } from "../../lib/session";


export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });
  return res.status(200).json({ userId });
}
