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
    de: "Calendar",
    cs: "Calendar",
    sk: "Calendar",
    ua: "Calendar",
    lt: "Calendar",
    vi: "Calendar",
  },
  "permissionCategory.offers": {
    pl: "Oferty",
    en: "Offers",
    de: "Offers",
    cs: "Offers",
    sk: "Offers",
    ua: "Offers",
    lt: "Offers",
    vi: "Offers",
  },
  "permissionCategory.clients": {
    pl: "Klienci",
    en: "Clients",
    de: "Clients",
    cs: "Clients",
    sk: "Clients",
    ua: "Clients",
    lt: "Clients",
    vi: "Clients",
  },
  "permissionCategory.team": {
    pl: "Zespół",
    en: "Team",
    de: "Team",
    cs: "Team",
    sk: "Team",
    ua: "Team",
    lt: "Team",
    vi: "Team",
  },
  "permissionCategory.reports": {
    pl: "Raporty",
    en: "Reports",
    de: "Reports",
    cs: "Reports",
    sk: "Reports",
    ua: "Reports",
    lt: "Reports",
    vi: "Reports",
  },
  "permissionCategory.files": {
    pl: "Pliki",
    en: "Files",
    de: "Files",
    cs: "Files",
    sk: "Files",
    ua: "Files",
    lt: "Files",
    vi: "Files",
  },
  "permissionCategory.external_listings": {
    pl: "Oferty zewnętrzne",
    en: "External listings",
    de: "External listings",
    cs: "External listings",
    sk: "External listings",
    ua: "External listings",
    lt: "External listings",
    vi: "External listings",
  },
};

const MODULE_LABELS_PL: Record<string, string> = {
  calendar: "kalendarza",
  offers: "ofert",
  clients: "klientów",
  team: "zespołu",
  reports: "raportów",
  files: "plików",
  external_listings: "ofert zewnętrznych",
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

const SCOPE_LABELS_PL: Record<string, string> = {
  own: "własnych",
  office: "biura",
  organization: "organizacji",
  global: "globalnych",
};

const SCOPE_LABELS_EN: Record<string, string> = {
  own: "own",
  office: "office",
  organization: "organization",
  global: "global",
};

function toTranslationKey(permissionKey: string): string {
  return `permission.${permissionKey}`;
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
  const moduleLabel = MODULE_LABELS_PL[moduleName] ?? moduleName;
  const scopeLabel = SCOPE_LABELS_PL[scope] ?? scope;

  const actionMap: Record<string, string> = {
    view: `Podgląd ${scopeLabel} ${moduleLabel}`,
    create: `Tworzenie ${moduleLabel} w zakresie ${scopeLabel}`,
    edit: `Edycja ${scopeLabel} ${moduleLabel}`,
    delete: `Usuwanie ${scopeLabel} ${moduleLabel}`,
    archive: `Archiwizacja ${scopeLabel} ${moduleLabel}`,
    publish: `Publikacja ${scopeLabel} ${moduleLabel}`,
    export: `Eksport ${scopeLabel} ${moduleLabel}`,
    import: `Import ${scopeLabel} ${moduleLabel}`,
    assign: `Przypisywanie ${scopeLabel} ${moduleLabel}`,
    enrich: `Wzbogacanie ${scopeLabel} ${moduleLabel}`,
    invite: `Zapraszanie użytkowników w zakresie ${scopeLabel}`,
    deactivate: `Dezaktywacja ${scopeLabel} ${moduleLabel}`,
  };

  return actionMap[action] ?? `${action} ${scopeLabel} ${moduleLabel}`;
}

function buildEnglishLabel(moduleName: string, action: string, scope: string): string {
  const moduleLabel = MODULE_LABELS_EN[moduleName] ?? moduleName;
  const scopeLabel = SCOPE_LABELS_EN[scope] ?? scope;

  const actionMap: Record<string, string> = {
    view: `View ${scopeLabel} ${moduleLabel}`,
    create: `Create ${scopeLabel} ${moduleLabel}`,
    edit: `Edit ${scopeLabel} ${moduleLabel}`,
    delete: `Delete ${scopeLabel} ${moduleLabel}`,
    archive: `Archive ${scopeLabel} ${moduleLabel}`,
    publish: `Publish ${scopeLabel} ${moduleLabel}`,
    export: `Export ${scopeLabel} ${moduleLabel}`,
    import: `Import ${scopeLabel} ${moduleLabel}`,
    assign: `Assign ${scopeLabel} ${moduleLabel}`,
    enrich: `Enrich ${scopeLabel} ${moduleLabel}`,
    invite: `Invite users in ${scopeLabel} scope`,
    deactivate: `Deactivate ${scopeLabel} ${moduleLabel}`,
  };

  return actionMap[action] ?? `${action} ${scopeLabel} ${moduleLabel}`;
}

function buildPolishSubresourceLabel(
  moduleName: string,
  subresource: string,
  action: string,
  scope: string
): string {
  const scopeLabel = SCOPE_LABELS_PL[scope] ?? scope;

  const plSubresources: Record<string, string> = {
    integrations: "integracji",
    images: "zdjęć",
    notes: "notatek",
    contacts: "kontaktów",
    addresses: "adresów",
    consents: "zgód",
    edit_membership: "członkostwem",
    manage_roles: "rolami",
    manage_permissions: "uprawnieniami",
    manage_profiles: "profilami uprawnień",
    run_backfill: "uzupełniania numerów",
  };

  const subject = plSubresources[subresource] ?? subresource;

  const actionMap: Record<string, string> = {
    view: `Podgląd ${subject} w zakresie ${scopeLabel}`,
    manage: `Zarządzanie ${subject} w zakresie ${scopeLabel}`,
    run: `Uruchamianie ${subject} w zakresie ${scopeLabel}`,
  };

  if (subresource === "edit_membership") return `Edycja członkostwa w zakresie ${scopeLabel}`;
  if (subresource === "manage_roles") return `Zarządzanie rolami w zakresie ${scopeLabel}`;
  if (subresource === "manage_permissions") return `Zarządzanie uprawnieniami w zakresie ${scopeLabel}`;
  if (subresource === "manage_profiles") return `Zarządzanie profilami uprawnień w zakresie ${scopeLabel}`;
  if (subresource === "run_backfill") return `Uruchamianie backfillu w zakresie ${scopeLabel}`;

  return actionMap[action] ?? `${action} ${subject} ${scopeLabel} (${moduleName})`;
}

function buildEnglishSubresourceLabel(
  moduleName: string,
  subresource: string,
  action: string,
  scope: string
): string {
  const scopeLabel = SCOPE_LABELS_EN[scope] ?? scope;

  const enSubresources: Record<string, string> = {
    integrations: "integrations",
    images: "images",
    notes: "notes",
    contacts: "contacts",
    addresses: "addresses",
    consents: "consents",
    edit_membership: "memberships",
    manage_roles: "roles",
    manage_permissions: "permissions",
    manage_profiles: "permission profiles",
    run_backfill: "backfill",
  };

  const subject = enSubresources[subresource] ?? subresource;

  const actionMap: Record<string, string> = {
    view: `View ${subject} in ${scopeLabel} scope`,
    manage: `Manage ${subject} in ${scopeLabel} scope`,
    run: `Run ${subject} in ${scopeLabel} scope`,
  };

  if (subresource === "edit_membership") return `Edit memberships in ${scopeLabel} scope`;
  if (subresource === "manage_roles") return `Manage roles in ${scopeLabel} scope`;
  if (subresource === "manage_permissions") return `Manage permissions in ${scopeLabel} scope`;
  if (subresource === "manage_profiles") return `Manage permission profiles in ${scopeLabel} scope`;
  if (subresource === "run_backfill") return `Run backfill in ${scopeLabel} scope`;

  return actionMap[action] ?? `${action} ${subject} ${scopeLabel} (${moduleName})`;
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