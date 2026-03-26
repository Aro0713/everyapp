import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function mustUserId(req: NextApiRequest) {
  const uid = getUserIdFromRequest(req);
  if (!uid) throw new Error("UNAUTHORIZED");
  return uid;
}

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function optBool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const x = v.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(x)) return true;
    if (["false", "0", "no", "n", "off"].includes(x)) return false;
  }
  return fallback;
}

function optInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function optNumeric(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function slugToken(value: string | null | undefined, fallback: string, maxLen: number) {
  const raw = (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  const token = raw.slice(0, maxLen);
  return token || fallback;
}

function buildAgentToken(fullName: string | null | undefined, email: string | null | undefined) {
  const normalizedName = (fullName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (normalizedName) {
    const parts = normalizedName
      .split(/\s+/)
      .map((x) => x.replace(/[^A-Za-z0-9]/g, ""))
      .filter(Boolean);

    if (parts.length >= 2) {
      const first = parts[0][0] ?? "";
      const last = parts[parts.length - 1][0] ?? "";
      const initials = `${first}${last}`.toUpperCase();
      if (initials) return initials;
    }

    if (parts.length === 1) {
      return parts[0].slice(0, 3).toUpperCase();
    }
  }

  const emailLocal = (email ?? "").split("@")[0]?.replace(/[^A-Za-z0-9]/g, "") ?? "";
  return emailLocal.slice(0, 3).toUpperCase() || "USR";
}

async function generateOfferNumber(
  client: any,
  officeId: string,
  caseOwnerUserId: string
): Promise<string> {
  const officeRes = await client.query(
    `
    SELECT name, invite_code
    FROM public.offices
    WHERE id = $1
    LIMIT 1
    `,
    [officeId]
  );

  const office = officeRes.rows[0];
  if (!office) throw new Error("OFFICE_NOT_FOUND");

  const userRes = await client.query(
    `
    SELECT full_name, email
    FROM public.users
    WHERE id = $1
    LIMIT 1
    `,
    [caseOwnerUserId]
  );

  const user = userRes.rows[0];
  if (!user) throw new Error("CASE_OWNER_NOT_FOUND");

  const officeToken = slugToken(office.invite_code ?? office.name, "OFFICE", 6);
  const agentToken = buildAgentToken(user.full_name, user.email);
  const year = new Date().getFullYear().toString();

  const seqRes = await client.query(
    `
    SELECT COALESCE(MAX(CAST(SPLIT_PART(offer_number, '/', 1) AS INTEGER)), 0) AS max_seq
    FROM public.listings
    WHERE office_id = $1
      AND offer_number IS NOT NULL
      AND RIGHT(offer_number, 4) = $2
    `,
    [officeId, year]
  );

  const nextSeq = Number(seqRes.rows[0]?.max_seq ?? 0) + 1;
  const seq = String(nextSeq).padStart(4, "0");

  return `${seq}/${officeToken}/${agentToken}/${year}`;
}

const ALLOWED_CLIENT_ROLES = new Set([
  "buyer",
  "seller",
  "tenant",
  "landlord",
  "investor",
  "flipper",
  "developer",
  "external_agent",
] as const);

const ALLOWED_STATUSES = new Set([
  "new",
  "active",
  "in_progress",
  "won",
  "lost",
  "inactive",
  "archived",
] as const);

const ALLOWED_PIPELINE_STAGES = new Set([
  "lead",
  "qualified",
  "contacted",
  "meeting_scheduled",
  "needs_analysis",
  "property_match",
  "offer_preparation",
  "offer_sent",
  "negotiation",
  "contract_preparation",
  "closed_won",
  "closed_lost",
] as const);

const ALLOWED_CASE_TYPES = new Set([
  "seller",
  "buyer",
  "landlord",
  "tenant",
  "credit",
  "insurance",
  "offer_inquiry",
  "unspecified",
  "other",
] as const);

const ALLOWED_VISIBILITY_SCOPES = new Set([
  "everywhere",
  "network",
  "office",
  "group",
  "mine",
] as const);

const ALLOWED_PROPERTY_KINDS = new Set([
  "apartment",
  "house",
  "plot",
  "commercial_unit",
  "tenement",
  "warehouse",
  "other_commercial",
  "other",
] as const);

const ALLOWED_MARKET_TYPES = new Set([
  "primary",
  "secondary",
] as const);

const ALLOWED_CONTRACT_TYPES = new Set([
  "none",
  "exclusive_bilateral",
  "exclusive_unilateral",
  "open",
] as const);

const ALLOWED_INSURANCE_SUBJECTS = new Set([
  "house",
  "car",
  "vacation",
  "children",
  "other",
] as const);

type ClientRole =
  | "buyer"
  | "seller"
  | "tenant"
  | "landlord"
  | "investor"
  | "flipper"
  | "developer"
  | "external_agent";

type ClientStatus =
  | "new"
  | "active"
  | "in_progress"
  | "won"
  | "lost"
  | "inactive"
  | "archived";

type ClientPipelineStage =
  | "lead"
  | "qualified"
  | "contacted"
  | "meeting_scheduled"
  | "needs_analysis"
  | "property_match"
  | "offer_preparation"
  | "offer_sent"
  | "negotiation"
  | "contract_preparation"
  | "closed_won"
  | "closed_lost";

type ClientCaseType =
  | "seller"
  | "buyer"
  | "landlord"
  | "tenant"
  | "credit"
  | "insurance"
  | "offer_inquiry"
  | "unspecified"
  | "other";

type VisibilityScope =
  | "everywhere"
  | "network"
  | "office"
  | "group"
  | "mine";

type PropertyKind =
  | "apartment"
  | "house"
  | "plot"
  | "commercial_unit"
  | "tenement"
  | "warehouse"
  | "other_commercial"
  | "other";

type PropertyMarketType = "primary" | "secondary";

type PropertyContractType =
  | "none"
  | "exclusive_bilateral"
  | "exclusive_unilateral"
  | "open";

type InsuranceSubject =
  | "house"
  | "car"
  | "vacation"
  | "children"
  | "other";

type OrderDetailsInput = {
  propertyKind: PropertyKind | null;
  marketType: PropertyMarketType | null;
  contractType: PropertyContractType | null;
  caretakerUserId: string | null;

  expectedPropertyKind: PropertyKind | null;
  searchLocationText: string | null;

  budgetMin: number | null;
  budgetMax: number | null;
  roomsMin: number | null;
  roomsMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
};

type PropertyDetailsInput = {
  country: string | null;
  city: string | null;
  street: string | null;
  buildingNumber: string | null;
  unitNumber: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  pricePeriod: string | null;
  areaM2: number | null;
  roomsCount: number | null;
  floorNumber: number | null;
  floorTotal: number | null;
};

type OfferInquiryInput = {
  offerId: string | null;
  inquiryText: string | null;
  autofillFromOffer: boolean;
  autofillMarginPercent: number | null;
};

type CreditDetailsInput = {
  creditedPropertyPrice: number | null;
  plannedOwnContribution: number | null;
  loanPeriodMonths: number | null;
  concernsExistingProperty: boolean;
  relatedOfferId: string | null;
  existingPropertyNotes: string | null;
};

type InsuranceDetailsInput = {
  insuranceSubject: InsuranceSubject | null;
  insuranceNotes: string | null;
};

type ContactPayload = {
  partyType: "person" | "company";
  clientRoles: ClientRole[];
  status: ClientStatus;
  pipelineStage: ClientPipelineStage;

  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;

  phone: string | null;
  email: string | null;
  notes: string | null;
  source: string | null;

  pesel: string | null;
  nip: string | null;
  regon: string | null;
  krs: string | null;

  assignedUserId: string | null;
  marketingConsent: boolean;
  marketingConsentNotes: string | null;

  caseType: ClientCaseType;
  createCase: boolean;
  visibilityScope: VisibilityScope;
  clientBucket: "client" | "archive";

  orderDetails: OrderDetailsInput;
  propertyDetails: PropertyDetailsInput;
  offerInquiry: OfferInquiryInput;
  creditDetails: CreditDetailsInput;
  insuranceDetails: InsuranceDetailsInput;
};

type WorkflowType =
  | "contact"
  | "offer"
  | "demand_order"
  | "credit_order"
  | "insurance_order"
  | "offer_inquiry";

function normalizeRoles(value: unknown): ClientRole[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<ClientRole>();

  for (const item of value) {
    if (typeof item !== "string") continue;
    const role = item.trim();
    if (!role) continue;
    if (ALLOWED_CLIENT_ROLES.has(role as ClientRole)) {
      unique.add(role as ClientRole);
    }
  }

  return Array.from(unique);
}

function normalizeStatus(value: unknown): ClientStatus {
  const raw = optString(value);
  if (raw && ALLOWED_STATUSES.has(raw as ClientStatus)) {
    return raw as ClientStatus;
  }
  return "new";
}

function normalizePipelineStage(value: unknown): ClientPipelineStage {
  const raw = optString(value);
  if (raw && ALLOWED_PIPELINE_STAGES.has(raw as ClientPipelineStage)) {
    return raw as ClientPipelineStage;
  }
  return "lead";
}

function normalizeCaseType(value: unknown, roles: ClientRole[]): ClientCaseType {
  const raw = optString(value);
  if (raw && ALLOWED_CASE_TYPES.has(raw as ClientCaseType)) {
    return raw as ClientCaseType;
  }

  if (roles.includes("seller")) return "seller";
  if (roles.includes("buyer")) return "buyer";
  if (roles.includes("landlord")) return "landlord";
  if (roles.includes("tenant")) return "tenant";
  if (roles.includes("investor")) return "buyer";
  if (roles.includes("flipper")) return "buyer";
  if (roles.includes("developer")) return "seller";
  if (roles.includes("external_agent")) return "other";

  return "unspecified";
}

function normalizeVisibilityScope(value: unknown): VisibilityScope {
  const raw = optString(value);
  if (raw && ALLOWED_VISIBILITY_SCOPES.has(raw as VisibilityScope)) {
    return raw as VisibilityScope;
  }
  return "office";
}

function normalizePropertyKind(value: unknown): PropertyKind | null {
  const raw = optString(value);
  if (raw && ALLOWED_PROPERTY_KINDS.has(raw as PropertyKind)) {
    return raw as PropertyKind;
  }
  return null;
}

function normalizeMarketType(value: unknown): PropertyMarketType | null {
  const raw = optString(value);
  if (raw && ALLOWED_MARKET_TYPES.has(raw as PropertyMarketType)) {
    return raw as PropertyMarketType;
  }
  return null;
}

function normalizeContractType(value: unknown): PropertyContractType | null {
  const raw = optString(value);
  if (raw && ALLOWED_CONTRACT_TYPES.has(raw as PropertyContractType)) {
    return raw as PropertyContractType;
  }
  return null;
}

function normalizeInsuranceSubject(value: unknown): InsuranceSubject | null {
  const raw = optString(value);
  if (raw && ALLOWED_INSURANCE_SUBJECTS.has(raw as InsuranceSubject)) {
    return raw as InsuranceSubject;
  }
  return null;
}

function normalizeOrderDetails(body: any): OrderDetailsInput {
  const src = body?.orderDetails ?? body ?? {};
  return {
    propertyKind: normalizePropertyKind(src?.propertyKind),
    marketType: normalizeMarketType(src?.marketType),
    contractType: normalizeContractType(src?.contractType),
    caretakerUserId: optString(src?.caretakerUserId),

    expectedPropertyKind: normalizePropertyKind(src?.expectedPropertyKind),
    searchLocationText: optString(src?.searchLocationText),

    budgetMin: optNumeric(src?.budgetMin),
    budgetMax: optNumeric(src?.budgetMax),
    roomsMin: optInt(src?.roomsMin),
    roomsMax: optInt(src?.roomsMax),
    areaMin: optNumeric(src?.areaMin),
    areaMax: optNumeric(src?.areaMax),
  };
}

function normalizePropertyDetails(body: any): PropertyDetailsInput {
  const src = body?.propertyDetails ?? body ?? {};
  return {
    country: optString(src?.country),
    city: optString(src?.city),
    street: optString(src?.street),
    buildingNumber: optString(src?.buildingNumber),
    unitNumber: optString(src?.unitNumber),
    priceAmount: optNumeric(src?.priceAmount),
    priceCurrency: optString(src?.priceCurrency) ?? "PLN",
    pricePeriod: optString(src?.pricePeriod),
    areaM2: optNumeric(src?.areaM2),
    roomsCount: optInt(src?.roomsCount),
    floorNumber: optInt(src?.floorNumber),
    floorTotal: optInt(src?.floorTotal),
  };
}

function normalizeOfferInquiry(body: any): OfferInquiryInput {
  const src = body?.offerInquiry ?? body ?? {};
  return {
    offerId: optString(src?.offerId),
    inquiryText: optString(src?.inquiryText),
    autofillFromOffer: optBool(src?.autofillFromOffer, false),
    autofillMarginPercent: optNumeric(src?.autofillMarginPercent) ?? 10,
  };
}

function normalizeCreditDetails(body: any): CreditDetailsInput {
  const src = body?.creditDetails ?? body ?? {};
  return {
    creditedPropertyPrice: optNumeric(src?.creditedPropertyPrice),
    plannedOwnContribution: optNumeric(src?.plannedOwnContribution),
    loanPeriodMonths: optInt(src?.loanPeriodMonths),
    concernsExistingProperty: optBool(src?.concernsExistingProperty, false),
    relatedOfferId: optString(src?.relatedOfferId),
    existingPropertyNotes: optString(src?.existingPropertyNotes),
  };
}

function normalizeInsuranceDetails(body: any): InsuranceDetailsInput {
  const src = body?.insuranceDetails ?? body ?? {};
  return {
    insuranceSubject: normalizeInsuranceSubject(src?.insuranceSubject),
    insuranceNotes: optString(src?.insuranceNotes),
  };
}

function finalizeRolesForCaseType(inputRoles: ClientRole[], caseType: ClientCaseType): ClientRole[] {
  const unique = new Set<ClientRole>(inputRoles);

  if (caseType === "seller") unique.add("seller");
  if (caseType === "buyer") unique.add("buyer");
  if (caseType === "landlord") unique.add("landlord");
  if (caseType === "tenant") unique.add("tenant");

  // wymaganie szefa: zapytanie na ofertę = klient kupujący powiązany z ofertą
  if (caseType === "offer_inquiry") unique.add("buyer");

  return Array.from(unique);
}

function shouldCreateCaseByDefault(caseType: ClientCaseType) {
  return !["other", "unspecified"].includes(caseType);
}

function normalizePayload(body: any): ContactPayload {
  const partyType = optString(body?.partyType) === "company" ? "company" : "person";

  const firstName = optString(body?.firstName);
  const lastName = optString(body?.lastName);
  const companyName = optString(body?.companyName);

  const derivedFullName =
    partyType === "company"
      ? companyName
      : [firstName, lastName].filter(Boolean).join(" ").trim() || null;

  const rawRoles = normalizeRoles(body?.clientRoles);
  const caseType = normalizeCaseType(body?.caseType, rawRoles);
  const clientRoles = finalizeRolesForCaseType(rawRoles, caseType);

  return {
    partyType,
    clientRoles,
    status: normalizeStatus(body?.status),
    pipelineStage: normalizePipelineStage(body?.pipelineStage),

    fullName: optString(body?.fullName) ?? derivedFullName,
    firstName,
    lastName,
    companyName,

    phone: optString(body?.phone),
    email: optString(body?.email),
    notes: optString(body?.notes),
    source: optString(body?.source) ?? "manual",

    pesel: optString(body?.pesel),
    nip: optString(body?.nip),
    regon: optString(body?.regon),
    krs: optString(body?.krs),

    assignedUserId: optString(body?.assignedUserId),
    marketingConsent: optBool(body?.marketingConsent, false),
    marketingConsentNotes: optString(body?.marketingConsentNotes),

    caseType,
    createCase:
      body?.createCase === undefined
        ? shouldCreateCaseByDefault(caseType)
        : optBool(body?.createCase, shouldCreateCaseByDefault(caseType)),
    visibilityScope: normalizeVisibilityScope(body?.visibilityScope),
    clientBucket: optString(body?.clientBucket) === "archive" ? "archive" : "client",

    orderDetails: normalizeOrderDetails(body),
    propertyDetails: normalizePropertyDetails(body),
    offerInquiry: normalizeOfferInquiry(body),
    creditDetails: normalizeCreditDetails(body),
    insuranceDetails: normalizeInsuranceDetails(body),
  };
}

function shouldInsertOrderDetails(caseType: ClientCaseType) {
  return ["seller", "buyer", "landlord", "tenant", "offer_inquiry"].includes(caseType);
}

function shouldInsertPropertyDetails(caseType: ClientCaseType) {
  return ["seller", "landlord"].includes(caseType);
}

function shouldInsertOfferInquiry(caseType: ClientCaseType) {
  return caseType === "offer_inquiry";
}

function shouldInsertCreditDetails(caseType: ClientCaseType) {
  return caseType === "credit";
}

function shouldInsertInsuranceDetails(caseType: ClientCaseType) {
  return caseType === "insurance";
}

async function createListingForCase(
  client: any,
  officeId: string,
  userId: string,
  partyId: string,
  payload: ContactPayload
): Promise<{ listingId: string; redirectTo: string }> {
  const isLandlord = payload.caseType === "landlord";
  const transactionType = isLandlord ? "rent" : "sale";
  const listingPartyRole = isLandlord ? "landlord" : "seller";

  const property = payload.propertyDetails;
  const order = payload.orderDetails;

  const locationText =
    [property.city, property.street].filter(Boolean).join(", ") ||
    order.searchLocationText ||
    null;

  const title =
    payload.fullName
      ? `${isLandlord ? "Oferta wynajmu" : "Oferta sprzedaży"} - ${payload.fullName}`
      : `${isLandlord ? "Oferta wynajmu" : "Oferta sprzedaży"}${order.propertyKind ? ` ${order.propertyKind}` : ""}`;

  const description =
    payload.notes ??
    (isLandlord
      ? "Nowa oferta wynajmu utworzona z formularza kontaktu."
      : "Nowa oferta sprzedaży utworzona z formularza kontaktu.");

  const streetFull = property.street
    ? [property.street, property.buildingNumber, property.unitNumber].filter(Boolean).join(" ")
    : null;

  const offerNumber = await generateOfferNumber(
    client,
    officeId,
    payload.assignedUserId ?? userId
  );

  const inserted = await client.query(
    `
    INSERT INTO public.listings (
      office_id,
      record_type,
      transaction_type,
      status,
      created_by_user_id,
      case_owner_user_id,
      contract_type,
      market,
      internal_notes,
      currency,
      price_amount,
      budget_min,
      budget_max,
      area_min_m2,
      area_max_m2,
      rooms_min,
      rooms_max,
      location_text,
      title,
      description,
      property_type,
      area_m2,
      rooms,
      floor,
      year_built,
      voivodeship,
      city,
      district,
      street,
      postal_code,
      lat,
      lng
    )
    VALUES (
      $1,
      'offer',
      $2,
      'draft'::listing_status,
      $3,
      $4,
      $5,
      $6,
      $7,
      COALESCE($8, 'PLN'),
      $9,
      $10,
      $11,
      $12,
      $13,
      $14,
      $15,
      $16,
      $17,
      $18,
      $19,
      $20,
      $21,
      $22,
      $23,
      $24,
      $25,
      $26,
      $27,
      $28,
      $29,
      $30
    )
    RETURNING id
    `,
    [
      officeId,
      transactionType,
      userId,
      payload.assignedUserId ?? userId,
      order.contractType,
      order.marketType,
      payload.notes,
      property.priceCurrency ?? "PLN",
      property.priceAmount,
      order.budgetMin,
      order.budgetMax,
      order.areaMin,
      order.areaMax,
      order.roomsMin,
      order.roomsMax,
      locationText,
      title,
      description,
      order.propertyKind,
      property.areaM2,
      property.roomsCount,
      property.floorNumber !== null ? String(property.floorNumber) : null,
      null,
      null,
      property.city,
      null,
      streetFull,
      null,
      null,
      null,
    ]
  );

  const listingId = inserted.rows[0].id as string;

  await client.query(
    `
    UPDATE public.listings
    SET offer_number = $2
    WHERE id = $1
      AND office_id = $3
    `,
    [listingId, offerNumber, officeId]
  );

  await client.query(
    `
    INSERT INTO public.listing_parties (
      listing_id,
      party_id,
      role,
      is_primary,
      notes
    )
    VALUES (
      $1,
      $2,
      $3::public.listing_party_role,
      true,
      $4
    )
    `,
    [listingId, partyId, listingPartyRole, payload.notes]
  );

  return {
    listingId,
    redirectTo: `/panel/offers/${listingId}`,
  };
}

function buildWorkflowNavigation(args: {
  caseType: ClientCaseType;
  partyId: string;
  clientCaseId: string | null;
  listingId: string | null;
}): {
  workflowType: WorkflowType;
  workflowId: string;
  redirectTo: string;
} {
  const { caseType, partyId, clientCaseId, listingId } = args;

  if ((caseType === "seller" || caseType === "landlord") && listingId) {
    return {
      workflowType: "offer",
      workflowId: listingId,
      redirectTo: `/panel/offers/${listingId}`,
    };
  }

  if ((caseType === "buyer" || caseType === "tenant") && clientCaseId) {
    return {
      workflowType: "demand_order",
      workflowId: clientCaseId,
      redirectTo: `/panel/demand-orders/${clientCaseId}`,
    };
  }

  if (caseType === "credit" && clientCaseId) {
    return {
      workflowType: "credit_order",
      workflowId: clientCaseId,
      redirectTo: `/panel/credit-orders/${clientCaseId}`,
    };
  }

  if (caseType === "insurance" && clientCaseId) {
    return {
      workflowType: "insurance_order",
      workflowId: clientCaseId,
      redirectTo: `/panel/insurance-orders/${clientCaseId}`,
    };
  }

  if (caseType === "offer_inquiry" && clientCaseId) {
    return {
      workflowType: "offer_inquiry",
      workflowId: clientCaseId,
      redirectTo: `/panel/offer-inquiries/${clientCaseId}`,
    };
  }

  return {
    workflowType: "contact",
    workflowId: partyId,
    redirectTo: `/panel/contacts/${partyId}`,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = await pool.connect();

  try {
    const userId = mustUserId(req);

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const officeId = await getOfficeIdForUserId(userId);
    const payload = normalizePayload(req.body ?? {});

    if (!payload.fullName) {
      return res.status(400).json({ error: "MISSING_FULL_NAME" });
    }

    if (!payload.phone && !payload.email) {
      return res.status(400).json({ error: "MISSING_CONTACT_CHANNEL" });
    }

    if (payload.partyType === "person" && (!payload.firstName || !payload.lastName)) {
      return res.status(400).json({ error: "MISSING_PERSON_NAME_PARTS" });
    }

    if (payload.partyType === "company" && !payload.companyName && !payload.fullName) {
      return res.status(400).json({ error: "MISSING_COMPANY_NAME" });
    }

    await client.query("BEGIN");

    const partyInsert = await client.query(
      `
      INSERT INTO public.parties (
        office_id,
        party_type,
        full_name,
        notes,
        source,
        created_by_user_id,
        assigned_user_id,
        status,
        pipeline_stage
      )
      VALUES (
        $1,
        $2::public.party_type,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8::public.party_status_type,
        $9::public.party_pipeline_stage_type
      )
      RETURNING id, office_id, party_type, full_name, status, pipeline_stage, created_at, updated_at
      `,
      [
        officeId,
        payload.partyType,
        payload.fullName,
        payload.notes,
        payload.source,
        userId,
        payload.assignedUserId ?? userId,
        payload.status,
        payload.pipelineStage,
      ]
    );

    const party = partyInsert.rows[0];
    const partyId = party.id as string;

    if (payload.partyType === "person") {
      await client.query(
        `
        INSERT INTO public.party_person_details (
          party_id,
          office_id,
          first_name,
          last_name,
          pesel,
          id_doc_type,
          id_doc_number
        )
        VALUES ($1, $2, $3, $4, $5, NULL, NULL)
        `,
        [partyId, officeId, payload.firstName, payload.lastName, payload.pesel]
      );
    }

    if (payload.partyType === "company") {
      await client.query(
        `
        INSERT INTO public.party_company_details (
          party_id,
          office_id,
          company_name,
          nip,
          regon,
          krs
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          partyId,
          officeId,
          payload.companyName ?? payload.fullName,
          payload.nip,
          payload.regon,
          payload.krs,
        ]
      );
    }

    if (payload.phone) {
      await client.query(
        `
        INSERT INTO public.party_contacts (
          party_id,
          kind,
          value,
          is_primary
        )
        VALUES (
          $1,
          'phone'::public.contact_kind,
          $2,
          true
        )
        `,
        [partyId, payload.phone]
      );
    }

    if (payload.email) {
      await client.query(
        `
        INSERT INTO public.party_contacts (
          party_id,
          kind,
          value,
          is_primary
        )
        VALUES (
          $1,
          'email'::public.contact_kind,
          $2,
          $3
        )
        `,
        [partyId, payload.email, payload.phone ? false : true]
      );
    }

    for (const role of payload.clientRoles) {
      await client.query(
        `
        INSERT INTO public.party_roles (
          office_id,
          party_id,
          role
        )
        VALUES (
          $1,
          $2,
          $3::public.party_role_type
        )
        ON CONFLICT (office_id, party_id, role) DO NOTHING
        `,
        [officeId, partyId, role]
      );
    }

    await client.query(
      `
      INSERT INTO public.party_consents (
        office_id,
        party_id,
        kind,
        granted,
        granted_at,
        source,
        notes
      )
      VALUES (
        $1,
        $2,
        'marketing'::public.consent_kind,
        $3,
        $4,
        $5,
        $6
      )
      ON CONFLICT (party_id, kind)
      DO UPDATE SET
        granted = EXCLUDED.granted,
        granted_at = EXCLUDED.granted_at,
        source = EXCLUDED.source,
        notes = EXCLUDED.notes
      `,
      [
        officeId,
        partyId,
        payload.marketingConsent,
        payload.marketingConsent ? new Date().toISOString() : null,
        payload.source,
        payload.marketingConsentNotes,
      ]
    );

    let clientCaseId: string | null = null;
    let createdEntityType: "listing" | "client_case" | "contact" = "contact";
    let createdEntityId: string | null = partyId;
    let listingId: string | null = null;

    if (payload.createCase) {
      const clientCaseInsert = await client.query(
        `
        INSERT INTO public.client_cases (
          office_id,
          party_id,
          case_type,
          status,
          assigned_user_id,
          created_by_user_id,
          source,
          notes,
          client_bucket
        )
        VALUES (
          $1,
          $2,
          $3,
          'active',
          $4,
          $5,
          $6,
          $7,
          $8
        )
        RETURNING id
        `,
        [
          officeId,
          partyId,
          payload.caseType,
          payload.assignedUserId ?? userId,
          userId,
          payload.source,
          payload.notes,
          payload.clientBucket,
        ]
      );

      clientCaseId = clientCaseInsert.rows[0]?.id ?? null;

      if (clientCaseId) {
        createdEntityType = "client_case";
        createdEntityId = clientCaseId;

        await client.query(
          `
          INSERT INTO public.client_case_visibility_rules (
            office_id,
            client_case_id,
            visibility_scope,
            owner_user_id,
            owner_membership_id
          )
          VALUES ($1, $2, $3::public.ownership_scope_type, $4, NULL)
          `,
          [officeId, clientCaseId, payload.visibilityScope, payload.assignedUserId ?? userId]
        );

        if (shouldInsertOrderDetails(payload.caseType)) {
          const x = payload.orderDetails;

          await client.query(
            `
            INSERT INTO public.client_case_order_details (
              office_id,
              client_case_id,
              property_kind,
              market_type,
              contract_type,
              caretaker_user_id,
              expected_property_kind,
              search_location_text,
              budget_min,
              budget_max,
              rooms_min,
              rooms_max,
              area_min,
              area_max
            )
            VALUES (
              $1,
              $2,
              $3::public.property_kind_type,
              $4::public.property_market_type,
              $5::public.property_contract_type,
              $6,
              $7::public.property_kind_type,
              $8,
              $9,
              $10,
              $11,
              $12,
              $13,
              $14
            )
            `,
            [
              officeId,
              clientCaseId,
              x.propertyKind,
              x.marketType,
              x.contractType,
              x.caretakerUserId ?? payload.assignedUserId ?? userId,
              x.expectedPropertyKind,
              x.searchLocationText,
              x.budgetMin,
              x.budgetMax,
              x.roomsMin,
              x.roomsMax,
              x.areaMin,
              x.areaMax,
            ]
          );
        }

        if (shouldInsertPropertyDetails(payload.caseType)) {
          const x = payload.propertyDetails;

          await client.query(
            `
            INSERT INTO public.client_case_properties (
              office_id,
              client_case_id,
              country,
              city,
              street,
              building_number,
              unit_number,
              price_amount,
              price_currency,
              price_period,
              area_m2,
              rooms_count,
              floor_number,
              floor_total
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
            )
            `,
            [
              officeId,
              clientCaseId,
              x.country,
              x.city,
              x.street,
              x.buildingNumber,
              x.unitNumber,
              x.priceAmount,
              x.priceCurrency,
              x.pricePeriod,
              x.areaM2,
              x.roomsCount,
              x.floorNumber,
              x.floorTotal,
            ]
          );
        }

        if (shouldInsertOfferInquiry(payload.caseType)) {
          const x = payload.offerInquiry;

          await client.query(
            `
            INSERT INTO public.client_case_offer_inquiries (
              office_id,
              client_case_id,
              offer_id,
              inquiry_text,
              autofill_from_offer,
              autofill_margin_percent
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
              officeId,
              clientCaseId,
              x.offerId,
              x.inquiryText,
              x.autofillFromOffer,
              x.autofillMarginPercent,
            ]
          );
        }

        if (shouldInsertCreditDetails(payload.caseType)) {
          const x = payload.creditDetails;

          await client.query(
            `
            INSERT INTO public.client_case_credit_details (
              office_id,
              client_case_id,
              credited_property_price,
              planned_own_contribution,
              loan_period_months,
              concerns_existing_property,
              related_offer_id,
              existing_property_notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `,
            [
              officeId,
              clientCaseId,
              x.creditedPropertyPrice,
              x.plannedOwnContribution,
              x.loanPeriodMonths,
              x.concernsExistingProperty,
              x.relatedOfferId,
              x.existingPropertyNotes,
            ]
          );
        }

        if (shouldInsertInsuranceDetails(payload.caseType)) {
          const x = payload.insuranceDetails;

          await client.query(
            `
            INSERT INTO public.client_case_insurance_details (
              office_id,
              client_case_id,
              insurance_subject,
              insurance_notes
            )
            VALUES (
              $1,
              $2,
              $3::public.insurance_subject_type,
              $4
            )
            `,
            [
              officeId,
              clientCaseId,
              x.insuranceSubject,
              x.insuranceNotes,
            ]
          );
        }

        if (payload.caseType === "seller" || payload.caseType === "landlord") {
          const created = await createListingForCase(
            client,
            officeId,
            userId,
            partyId,
            payload
          );

          listingId = created.listingId;
          createdEntityType = "listing";
          createdEntityId = created.listingId;
        }
      }
    }

    const refreshed = await client.query(
      `
      SELECT
        id,
        office_id,
        party_type::text AS party_type,
        full_name,
        notes,
        source,
        created_by_user_id,
        assigned_user_id,
        status::text AS status,
        pipeline_stage::text AS pipeline_stage,
        created_at,
        updated_at,
        first_name,
        last_name,
        pesel,
        company_name,
        nip,
        regon,
        krs,
        phone,
        email,
        client_roles,
        has_interactions,
        interactions_count
      FROM public.crm_contacts_view
      WHERE id = $1
        AND office_id = $2
      LIMIT 1
      `,
      [partyId, officeId]
    );

    const navigation = buildWorkflowNavigation({
      caseType: payload.caseType,
      partyId,
      clientCaseId,
      listingId,
    });

    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      row: refreshed.rows[0] ?? null,
      clientCaseId,
      createdCase: Boolean(clientCaseId),
      createdEntityType,
      createdEntityId,
      workflowType: navigation.workflowType,
      workflowId: navigation.workflowId,
      redirectTo: navigation.redirectTo,
    });
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => null);

    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("CONTACTS_CREATE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}