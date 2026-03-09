const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");

const app = express();

const PORT = process.env.PORT || 8787;
const CRAWLER_TRIGGER_TOKEN = process.env.CRAWLER_TRIGGER_TOKEN || "";

app.use(cors({
  origin: [
    "https://www.everyapp.pl",
    "https://everyapp.vercel.app",
  ],
  methods: ["POST", "OPTIONS"],
}));

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "crawler-control" });
});

app.post("/run-phone-backfill", (req, res) => {
  const authHeader = req.headers.authorization || "";
  const expected = `Bearer ${CRAWLER_TRIGGER_TOKEN}`;

  if (!CRAWLER_TRIGGER_TOKEN) {
    return res.status(500).json({
      ok: false,
      error: "MISSING_SERVER_TOKEN",
    });
  }

  if (authHeader !== expected) {
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
  }

  const command =
    'powershell -ExecutionPolicy Bypass -Command "cd C:\\Users\\a4pem\\everyapp-app\\crawler; npx tsx src/jobs/backfillExternalPhones.ts"';

  exec(command, (err, stdout, stderr) => {
    if (err) {
      console.error("CRAWLER_START_ERROR", err);
      console.error(stderr);

      return res.status(500).json({
        ok: false,
        error: "CRAWLER_START_FAILED",
      });
    }

    console.log(stdout);
    console.error(stderr);

    return res.json({
      ok: true,
      message: "Crawler started",
    });
  });
});

app.listen(PORT, () => {
  console.log(`crawler-control listening on port ${PORT}`);
});