// lib/everybot/enrichers/index.ts
import type { Enricher, SourceKey } from "./types";

import otodom from "./otodom";
import olx from "./olx";
import nieruchomosciOnline from "./nieruchomosci-online";
import gratka from "./gratka";
import morizon from "./morizon";
import owner from "./owner";

export type { Enricher, SourceKey, EnrichResult } from "./types";

export const enrichRegistry: Record<SourceKey, Enricher> = {
  otodom,
  olx,
  gratka,
  morizon,
  odwlasciciela: owner,
  nieruchomosci_online: nieruchomosciOnline,
};
