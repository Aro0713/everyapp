import { getDueSources, markSourceStatus } from "./sources.js";
import { importBatch, chunk } from "./importer.js";
import { harvestGeneric } from "./adapters/generic.js";
import type { ImportItem } from "./types.js";

function intEnv(name: string, def: number) {
  const v = process.env[name];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

async function runOneSource(source: any) {
  // MVP: tylko generic adapter (sterowany meta)
  // później: switch(adapter) -> otodom/olx/gratka...
  const items: ImportItem[] = await harvestGeneric(source);

  const batches = chunk(items, 100);
  for (const b of batches) {
    await importBatch(source.office_id, b);
  }
}

async function main() {
  const batchSize = intEnv("BATCH_SIZE", 30);

  const sources = await getDueSources(batchSize);
  console.log(`Due sources: ${sources.length}`);

  for (const s of sources) {
    try {
      console.log(`Crawling: ${s.name} (${s.base_url})`);
      await runOneSource(s);
      await markSourceStatus(s.id, "ok");
      console.log(`OK: ${s.name}`);
    } catch (e: any) {
      console.error(`ERR: ${s.name}`, e?.message ?? e);
      await markSourceStatus(s.id, `error:${String(e?.message ?? e).slice(0, 200)}`);
    }
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
