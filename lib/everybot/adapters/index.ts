import otodom from "./otodom";
import olx from "./olx";
import { EverybotAdapter } from "./types";

export const adapterRegistry: Record<string, EverybotAdapter> = {
  otodom,
  olx,
};
