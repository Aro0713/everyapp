import fs from "node:fs";
import path from "node:path";

type LangMap = {
  pl: string;
  en: string;
  de: string;
  cs: string;
  sk: string;
  ua: string;
  lt: string;
  vi: string;
};

const PERMISSION_KEYS = [
  // calendar
  "calendar.view.own",
  "calendar.view.office",
  "calendar.view.organization",
  "calendar.create.own",
  "calendar.create.office",
  "calendar.edit.own",
  "calendar.edit.office",
  "calendar.edit.organization",
  "calendar.delete.own",
  "calendar.delete.office",
  "calendar.delete.organization",
  "calendar.integrations.view.office",
  "calendar.integrations.manage.office",

  // offers
  "offers.view.own",
  "offers.view.office",
  "offers.view.organization",
  "offers.create.office",
  "offers.create.organization",
  "offers.edit.own",
  "offers.edit.office",
  "offers.edit.organization",
  "offers.delete.office",
  "offers.delete.organization",
  "offers.archive.office",
  "offers.publish.office",
  "offers.export.office",
  "offers.images.view.office",
  "offers.images.manage.office",
  "offers.notes.view.office",
  "offers.notes.manage.office",

  // clients
  "clients.view.own",
  "clients.view.office",
  "clients.view.organization",
  "clients.view_sensitive.office",
  "clients.create.office",
  "clients.edit.own",
  "clients.edit.office",
  "clients.delete.office",
  "clients.export.office",
  "clients.contacts.view.office",
  "clients.contacts.manage.office",
  "clients.addresses.view.office",
  "clients.addresses.manage.office",
  "clients.consents.view.office",
  "clients.consents.manage.office",

  // team
  "team.view.office",
  "team.view.organization",
  "team.invite.office",
  "team.edit_membership.office",
  "team.manage_roles.office",
  "team.manage_permissions.office",
  "team.manage_profiles.office",
  "team.deactivate.office",

  // reports
  "reports.view.own",
  "reports.view.office",
  "reports.view.organization",
  "reports.export.office",
  "reports.export.organization",

  // files
  "files.view.office",
  "files.upload.office",
  "files.delete.office",
  "files.export.office",

  // external_listings
  "external_listings.view.office",
  "external_listings.view.organization",
  "external_listings.import.office",
  "external_listings.assign.office",
  "external_listings.archive.office",
  "external_listings.enrich.office",
  "external_listings.run_backfill.office",
  "external_listings.run_backfill.global",
] as const;

const CATEGORY_KEYS = [
  "permissionCategory.calendar",
  "permissionCategory.offers",
  "permissionCategory.clients",
  "permissionCategory.team",
  "permissionCategory.reports",
  "permissionCategory.files",
  "permissionCategory.external_listings",
] as const;

const CATEGORY_LABELS: Record<string, LangMap> = {
  "permissionCategory.calendar": {
    pl: "Kalendarz",
    en: "Calendar",
    de: "Kalender",
    cs: "Kalendář",
    sk: "Kalendár",
    ua: "Календар",
    lt: "Kalendorius",
    vi: "Lịch",
  },
  "permissionCategory.offers": {
    pl: "Oferty",
    en: "Offers",
    de: "Angebote",
    cs: "Nabídky",
    sk: "Ponuky",
    ua: "Пропозиції",
    lt: "Pasiūlymai",
    vi: "Tin đăng",
  },
  "permissionCategory.clients": {
    pl: "Klienci",
    en: "Clients",
    de: "Kunden",
    cs: "Klienti",
    sk: "Klienti",
    ua: "Клієнти",
    lt: "Klientai",
    vi: "Khách hàng",
  },
  "permissionCategory.team": {
    pl: "Zespół",
    en: "Team",
    de: "Team",
    cs: "Tým",
    sk: "Tím",
    ua: "Команда",
    lt: "Komanda",
    vi: "Nhóm",
  },
  "permissionCategory.reports": {
    pl: "Raporty",
    en: "Reports",
    de: "Berichte",
    cs: "Reporty",
    sk: "Reporty",
    ua: "Звіти",
    lt: "Ataskaitos",
    vi: "Báo cáo",
  },
  "permissionCategory.files": {
    pl: "Pliki",
    en: "Files",
    de: "Dateien",
    cs: "Soubory",
    sk: "Súbory",
    ua: "Файли",
    lt: "Failai",
    vi: "Tệp",
  },
  "permissionCategory.external_listings": {
    pl: "Oferty zewnętrzne",
    en: "External listings",
    de: "Externe Angebote",
    cs: "Externí nabídky",
    sk: "Externé ponuky",
    ua: "Зовнішні оголошення",
    lt: "Išoriniai skelbimai",
    vi: "Tin đăng bên ngoài",
  },
};

const MODULE_LABELS_PL: Record<string, string> = {
  calendar: "kalendarz",
  offers: "oferty",
  clients: "klienci",
  team: "zespół",
  reports: "raporty",
  files: "pliki",
  external_listings: "oferty zewnętrzne",
};

const MODULE_LABELS_EN: Record<string, string> = {
  calendar: "calendar",
  offers: "offers",
  clients: "clients",
  team: "team",
  reports: "reports",
  files: "files",
  external_listings: "external listings",
};

const SUBRESOURCE_LABELS_PL: Record<string, string> = {
  integrations: "integracje",
  images: "zdjęcia",
  notes: "notatki",
  contacts: "dane kontaktowe",
  addresses: "adresy",
  consents: "zgody",
};

const SUBRESOURCE_LABELS_EN: Record<string, string> = {
  integrations: "integrations",
  images: "images",
  notes: "notes",
  contacts: "contact details",
  addresses: "addresses",
  consents: "consents",
};

function toTranslationKey(permissionKey: string): string {
  return `permission.${permissionKey}`;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function joinScopePL(scope: string): string {
  if (scope === "own") return "własnych";
  if (scope === "office") return "biura";
  if (scope === "organization") return "organizacji";
  if (scope === "global") return "globalnych";
  return scope;
}

function joinScopeEN(scope: string): string {
  if (scope === "own") return "own";
  if (scope === "office") return "office";
  if (scope === "organization") return "organization";
  if (scope === "global") return "global";
  return scope;
}

function buildPermissionLabel(permissionKey: string): LangMap {
  const parts = permissionKey.split(".");
  const moduleName = parts[0] ?? "";
  const action = parts[1] ?? "";
  const maybeThird = parts[2] ?? "";
  const maybeFourth = parts[3] ?? "";

  let pl = permissionKey;
  let en = permissionKey;

  if (parts.length === 3) {
    const scope = maybeThird;
    pl = buildPolishLabel(moduleName, action, scope);
    en = buildEnglishLabel(moduleName, action, scope);
  } else if (parts.length === 4) {
    const subresource = maybeThird;
    const scope = maybeFourth;
    pl = buildPolishSubresourceLabel(moduleName, subresource, action, scope);
    en = buildEnglishSubresourceLabel(moduleName, subresource, action, scope);
  }

  return {
    pl,
    en,
    de: en,
    cs: en,
    sk: en,
    ua: en,
    lt: en,
    vi: en,
  };
}

function buildPolishLabel(moduleName: string, action: string, scope: string): string {
  const scopeLabel = joinScopePL(scope);

  if (moduleName === "calendar") {
    const map: Record<string, string> = {
      view: scope === "own" ? "Podgląd własnego kalendarza" : `Podgląd kalendarza ${scopeLabel}`,
      create: scope === "own"
        ? "Tworzenie wydarzeń we własnym kalendarzu"
        : `Tworzenie wydarzeń w kalendarzu ${scopeLabel}`,
      edit: scope === "own" ? "Edycja własnego kalendarza" : `Edycja kalendarza ${scopeLabel}`,
      delete: scope === "own"
        ? "Usuwanie z własnego kalendarza"
        : `Usuwanie z kalendarza ${scopeLabel}`,
    };
    return map[action] ?? `${capitalize(action)} kalendarza ${scopeLabel}`;
  }

  if (moduleName === "offers") {
    const map: Record<string, string> = {
      view: scope === "own" ? "Podgląd własnych ofert" : `Podgląd ofert ${scopeLabel}`,
      create: `Tworzenie ofert ${scope === "office" ? "w biurze" : "w organizacji"}`,
      edit: scope === "own" ? "Edycja własnych ofert" : `Edycja ofert ${scopeLabel}`,
      delete: `Usuwanie ofert ${scopeLabel}`,
      archive: `Archiwizacja ofert ${scopeLabel}`,
      publish: `Publikacja ofert ${scopeLabel}`,
      export: `Eksport ofert ${scopeLabel}`,
    };
    return map[action] ?? `${capitalize(action)} ofert ${scopeLabel}`;
  }

  if (moduleName === "clients") {
    const map: Record<string, string> = {
      view: scope === "own" ? "Podgląd własnych klientów" : `Podgląd klientów ${scopeLabel}`,
      view_sensitive: `Podgląd wrażliwych danych klientów ${scope === "office" ? "w biurze" : scopeLabel}`,
      create: `Tworzenie klientów ${scope === "office" ? "w biurze" : `w ${scopeLabel}`}`,
      edit: scope === "own" ? "Edycja własnych klientów" : `Edycja klientów ${scopeLabel}`,
      delete: `Usuwanie klientów ${scopeLabel}`,
      export: `Eksport klientów ${scopeLabel}`,
    };
    return map[action] ?? `${capitalize(action)} klientów ${scopeLabel}`;
  }

  if (moduleName === "team") {
    const map: Record<string, string> = {
      view: `Podgląd zespołu ${scopeLabel}`,
      invite: scope === "office" ? "Zapraszanie użytkowników do biura" : `Zapraszanie użytkowników do ${scopeLabel}`,
      deactivate: `Dezaktywacja członków zespołu ${scopeLabel}`,
    };
    return map[action] ?? `${capitalize(action)} zespołu ${scopeLabel}`;
  }

  if (moduleName === "reports") {
    const map: Record<string, string> = {
      view: scope === "own" ? "Podgląd własnych raportów" : `Podgląd raportów ${scopeLabel}`,
      export: `Eksport raportów ${scopeLabel}`,
    };
    return map[action] ?? `${capitalize(action)} raportów ${scopeLabel}`;
  }

  if (moduleName === "files") {
    const map: Record<string, string> = {
      view: `Podgląd plików ${scopeLabel}`,
      upload: `Przesyłanie plików ${scopeLabel}`,
      delete: `Usuwanie plików ${scopeLabel}`,
      export: `Eksport plików ${scopeLabel}`,
    };
    return map[action] ?? `${capitalize(action)} plików ${scopeLabel}`;
  }

  if (moduleName === "external_listings") {
    const map: Record<string, string> = {
      view: `Podgląd ofert zewnętrznych ${scopeLabel}`,
      import: `Import ofert zewnętrznych ${scopeLabel}`,
      assign: `Przypisywanie ofert zewnętrznych ${scopeLabel}`,
      archive: `Archiwizacja ofert zewnętrznych ${scopeLabel}`,
      enrich: `Wzbogacanie ofert zewnętrznych ${scopeLabel}`,
      run_backfill:
        scope === "global"
          ? "Uruchamianie globalnego backfillu ofert zewnętrznych"
          : "Uruchamianie backfillu ofert zewnętrznych w biurze",
    };
    return map[action] ?? `${capitalize(action)} ofert zewnętrznych ${scopeLabel}`;
  }

  const moduleLabel = MODULE_LABELS_PL[moduleName] ?? moduleName;
  return `${capitalize(action)} ${moduleLabel} ${scopeLabel}`;
}

function buildEnglishLabel(moduleName: string, action: string, scope: string): string {
  const scopeLabel = joinScopeEN(scope);

  if (moduleName === "calendar") {
    const map: Record<string, string> = {
      view: `View ${scopeLabel} calendar`,
      create: scope === "own" ? "Create events in own calendar" : `Create events in ${scopeLabel} calendar`,
      edit: `Edit ${scopeLabel} calendar`,
      delete: scope === "own" ? "Delete from own calendar" : `Delete from ${scopeLabel} calendar`,
    };
    return map[action] ?? `${capitalize(action)} ${scopeLabel} calendar`;
  }

  if (moduleName === "offers") {
    const map: Record<string, string> = {
      view: `View ${scopeLabel} offers`,
      create: `Create ${scopeLabel} offers`,
      edit: `Edit ${scopeLabel} offers`,
      delete: `Delete ${scopeLabel} offers`,
      archive: `Archive ${scopeLabel} offers`,
      publish: `Publish ${scopeLabel} offers`,
      export: `Export ${scopeLabel} offers`,
    };
    return map[action] ?? `${capitalize(action)} ${scopeLabel} offers`;
  }

  if (moduleName === "clients") {
    const map: Record<string, string> = {
      view: `View ${scopeLabel} clients`,
      view_sensitive: `View sensitive client data in ${scopeLabel}`,
      create: `Create ${scopeLabel} clients`,
      edit: `Edit ${scopeLabel} clients`,
      delete: `Delete ${scopeLabel} clients`,
      export: `Export ${scopeLabel} clients`,
    };
    return map[action] ?? `${capitalize(action)} ${scopeLabel} clients`;
  }

  if (moduleName === "team") {
    const map: Record<string, string> = {
      view: `View ${scopeLabel} team`,
      invite: scope === "office" ? "Invite users to office" : `Invite users to ${scopeLabel}`,
      deactivate: `Deactivate ${scopeLabel} team members`,
    };
    return map[action] ?? `${capitalize(action)} ${scopeLabel} team`;
  }

  if (moduleName === "reports") {
    const map: Record<string, string> = {
      view: `View ${scopeLabel} reports`,
      export: `Export ${scopeLabel} reports`,
    };
    return map[action] ?? `${capitalize(action)} ${scopeLabel} reports`;
  }

  if (moduleName === "files") {
    const map: Record<string, string> = {
      view: `View ${scopeLabel} files`,
      upload: `Upload ${scopeLabel} files`,
      delete: `Delete ${scopeLabel} files`,
      export: `Export ${scopeLabel} files`,
    };
    return map[action] ?? `${capitalize(action)} ${scopeLabel} files`;
  }

  if (moduleName === "external_listings") {
    const map: Record<string, string> = {
      view: `View ${scopeLabel} external listings`,
      import: `Import ${scopeLabel} external listings`,
      assign: `Assign ${scopeLabel} external listings`,
      archive: `Archive ${scopeLabel} external listings`,
      enrich: `Enrich ${scopeLabel} external listings`,
      run_backfill:
        scope === "global"
          ? "Run global external listings backfill"
          : "Run external listings backfill for office",
    };
    return map[action] ?? `${capitalize(action)} ${scopeLabel} external listings`;
  }

  const moduleLabel = MODULE_LABELS_EN[moduleName] ?? moduleName;
  return `${capitalize(action)} ${scopeLabel} ${moduleLabel}`;
}

function buildPolishSubresourceLabel(
  moduleName: string,
  subresource: string,
  action: string,
  scope: string
): string {
  const scopeLabel = joinScopePL(scope);

  if (moduleName === "calendar" && subresource === "integrations") {
    if (action === "view") return "Podgląd integracji kalendarza biura";
    if (action === "manage") return "Zarządzanie integracjami kalendarza biura";
  }

  if (moduleName === "offers" && subresource === "images") {
    if (action === "view") return "Podgląd zdjęć ofert w biurze";
    if (action === "manage") return "Zarządzanie zdjęciami ofert w biurze";
  }

  if (moduleName === "offers" && subresource === "notes") {
    if (action === "view") return "Podgląd notatek do ofert w biurze";
    if (action === "manage") return "Zarządzanie notatkami do ofert w biurze";
  }

  if (moduleName === "clients" && subresource === "contacts") {
    if (action === "view") return "Podgląd danych kontaktowych klientów w biurze";
    if (action === "manage") return "Zarządzanie danymi kontaktowymi klientów w biurze";
  }

  if (moduleName === "clients" && subresource === "addresses") {
    if (action === "view") return "Podgląd adresów klientów w biurze";
    if (action === "manage") return "Zarządzanie adresami klientów w biurze";
  }

  if (moduleName === "clients" && subresource === "consents") {
    if (action === "view") return "Podgląd zgód klientów w biurze";
    if (action === "manage") return "Zarządzanie zgodami klientów w biurze";
  }

  if (moduleName === "team" && action === "edit_membership") {
    return "Edycja członkostwa w zespole biura";
  }

  if (moduleName === "team" && action === "manage_roles") {
    return "Zarządzanie rolami w zespole biura";
  }

  if (moduleName === "team" && action === "manage_permissions") {
    return "Zarządzanie uprawnieniami w zespole biura";
  }

  if (moduleName === "team" && action === "manage_profiles") {
    return "Zarządzanie profilami uprawnień w biurze";
  }

  if (moduleName === "external_listings" && action === "run_backfill") {
    return scope === "global"
      ? "Uruchamianie globalnego backfillu ofert zewnętrznych"
      : "Uruchamianie backfillu ofert zewnętrznych w biurze";
  }

  const subLabel = SUBRESOURCE_LABELS_PL[subresource] ?? subresource;
  if (action === "view") return `Podgląd ${subLabel} ${scopeLabel}`;
  if (action === "manage") return `Zarządzanie ${subLabel} ${scopeLabel}`;

  return `${capitalize(action)} ${subLabel} ${scopeLabel}`;
}

function buildEnglishSubresourceLabel(
  moduleName: string,
  subresource: string,
  action: string,
  scope: string
): string {
  const scopeLabel = joinScopeEN(scope);

  if (moduleName === "calendar" && subresource === "integrations") {
    if (action === "view") return "View office calendar integrations";
    if (action === "manage") return "Manage office calendar integrations";
  }

  if (moduleName === "offers" && subresource === "images") {
    if (action === "view") return "View office offer images";
    if (action === "manage") return "Manage office offer images";
  }

  if (moduleName === "offers" && subresource === "notes") {
    if (action === "view") return "View office offer notes";
    if (action === "manage") return "Manage office offer notes";
  }

  if (moduleName === "clients" && subresource === "contacts") {
    if (action === "view") return "View client contact details in office";
    if (action === "manage") return "Manage client contact details in office";
  }

  if (moduleName === "clients" && subresource === "addresses") {
    if (action === "view") return "View client addresses in office";
    if (action === "manage") return "Manage client addresses in office";
  }

  if (moduleName === "clients" && subresource === "consents") {
    if (action === "view") return "View client consents in office";
    if (action === "manage") return "Manage client consents in office";
  }

  if (moduleName === "team" && action === "edit_membership") {
    return "Edit office team membership";
  }

  if (moduleName === "team" && action === "manage_roles") {
    return "Manage office team roles";
  }

  if (moduleName === "team" && action === "manage_permissions") {
    return "Manage office team permissions";
  }

  if (moduleName === "team" && action === "manage_profiles") {
    return "Manage office permission profiles";
  }

  if (moduleName === "external_listings" && action === "run_backfill") {
    return scope === "global"
      ? "Run global external listings backfill"
      : "Run external listings backfill for office";
  }

  const subLabel = SUBRESOURCE_LABELS_EN[subresource] ?? subresource;
  if (action === "view") return `View ${scopeLabel} ${subLabel}`;
  if (action === "manage") return `Manage ${scopeLabel} ${subLabel}`;

  return `${capitalize(action)} ${scopeLabel} ${subLabel}`;
}

function renderTranslationEntry(key: string, value: LangMap): string {
  return `"${key}": {
  pl: ${JSON.stringify(value.pl)},
  en: ${JSON.stringify(value.en)},
  de: ${JSON.stringify(value.de)},
  cs: ${JSON.stringify(value.cs)},
  sk: ${JSON.stringify(value.sk)},
  ua: ${JSON.stringify(value.ua)},
  lt: ${JSON.stringify(value.lt)},
  vi: ${JSON.stringify(value.vi)},
},`;
}

function main() {
  const lines: string[] = [];

  lines.push("// ===== AUTO-GENERATED PERMISSION CATEGORIES =====");
  for (const key of CATEGORY_KEYS) {
    lines.push(renderTranslationEntry(key, CATEGORY_LABELS[key]));
    lines.push("");
  }

  lines.push("// ===== AUTO-GENERATED PERMISSIONS =====");
  for (const permissionKey of PERMISSION_KEYS) {
    const translationKey = toTranslationKey(permissionKey);
    lines.push(renderTranslationEntry(translationKey, buildPermissionLabel(permissionKey)));
    lines.push("");
  }

  const output = lines.join("\n");
  const outPath = path.join(process.cwd(), "generated-permission-translations.txt");

  fs.writeFileSync(outPath, output, "utf8");
  console.log(`Generated: ${outPath}`);
}

main();