import { pool } from "./db.js";
import type { EverybotSource } from "./types.js";

export async function getDueSources(batchSize: number): Promise<EverybotSource[]> {
  const { rows } = await pool.query(
    `
    select *
    from everybot_sources
    where enabled = true
      and (
        last_crawled_at is null
        or last_crawled_at < now() - make_interval(mins => crawl_interval_minutes)
      )
    order by coalesce(last_crawled_at, '1970-01-01'::timestamptz) asc
    limit $1
    `,
    [batchSize]
  );
  return rows as EverybotSource[];
}

export async function markSourceStatus(sourceId: string, status: string) {
  await pool.query(
    `update everybot_sources set last_crawled_at = now(), last_status = $2 where id = $1`,
    [sourceId, status]
  );
}
