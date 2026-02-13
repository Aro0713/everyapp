// lib/everybot/html/extractMeta.ts
import * as cheerio from "cheerio";

export function extractMeta(html: string) {
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text().trim() ||
    null;

  const description =
    $('meta[name="description"]').attr("content") || null;

  const image =
    $('meta[property="og:image"]').attr("content") || null;

  return {
    title: title?.trim() ?? null,
    description: description?.trim() ?? null,
    image,
  };
}
