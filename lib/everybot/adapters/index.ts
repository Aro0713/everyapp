// lib/everybot/adapters/index.ts
import type { SourceKey } from "../enrichers/types";
import type { PortalAdapter } from "./types";

import otodomAdapter from "./otodom";
import olxAdapter from "./olx";

import gratkaAdapter from "./gratka";
import morizonAdapter from "./morizon";
import odwlascicielaAdapter from "./odwlasciciela";

export const adapterRegistry: Record<SourceKey, PortalAdapter | null> = {
  otodom: otodomAdapter,
  olx: olxAdapter,

  gratka: gratkaAdapter,
  morizon: morizonAdapter,
  odwlasciciela: odwlascicielaAdapter,

  // SourceKey ma ten klucz – na razie brak adaptera:
  nieruchomosci_online: null,
};
