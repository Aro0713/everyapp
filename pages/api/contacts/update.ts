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
  id: string | null;

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

function normalizePayload(body: any): ContactPayload {
  const partyType = optString(body?.partyType) === "company" ? "company" : "person";

  const firstName = optString(body?.firstName);
  const lastName = optString(body?.lastName);
  const companyName = optString(body?.companyName);

  const derivedFullName =
    partyType === "company"
      ? companyName
      : [firstName, lastName].filter(Boolean).join(" ").trim() || null;

  const clientRoles = normalizeRoles(body?.clientRoles);
  const caseType = normalizeCaseType(body?.caseType, clientRoles);

  return {
    id: optString(body?.id),

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
    createCase: body?.createCase === undefined ? caseType !== "other" : optBool(body?.createCase, true),
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

async function syncPrimaryContact(
  client: any,
  partyId: string,
  kind: "phone" | "email",
  value: string | null
) {
  const existing = await client.query(
    `
    SELECT id
    FROM public.party_contacts
    WHERE party_id = $1
      AND kind = $2::public.contact_kind
    ORDER BY is_primary DESC, created_at ASC
    `,
    [partyId, kind]
  );

  const first = existing.rows[0]?.id ?? null;
  const rest = existing.rows.slice(1).map((x: any) => x.id);

  if (!value) {
    if (existing.rows.length) {
      await client.query(
        `DELETE FROM public.party_contacts WHERE party_id = $1 AND kind = $2::public.contact_kind`,
        [partyId, kind]
      );
    }
    return;
  }

  if (first) {
    await client.query(
      `
      UPDATE public.party_contacts
      SET value = $2,
          is_primary = true
      WHERE id = $1
      `,
      [first, value]
    );

    if (rest.length) {
      await client.query(
        `DELETE FROM public.party_contacts WHERE id = ANY($1::uuid[])`,
        [rest]
      );
    }
  } else {
    await client.query(
      `
      INSERT INTO public.party_contacts (
        party_id,
        kind,
        value,
        is_primary
      )
      VALUES ($1, $2::public.contact_kind, $3, true)
      `,
      [partyId, kind, value]
    );
  }
}

async function syncPartyRoles(
  client: any,
  officeId: string,
  partyId: string,
  roles: ClientRole[]
) {
  await client.query(
    `DELETE FROM public.party_roles WHERE office_id = $1 AND party_id = $2`,
    [officeId, partyId]
  );

  for (const role of roles) {
    await client.query(
      `
      INSERT INTO public.party_roles (
        office_id,
        party_id,
        role
      )
      VALUES ($1, $2, $3::public.party_role_type)
      ON CONFLICT (office_id, party_id, role) DO NOTHING
      `,
      [officeId, partyId, role]
    );
  }
}

async function ensureClientCase(
  client: any,
  officeId: string,
  partyId: string,
  userId: string,
  payload: ContactPayload
): Promise<string | null> {
  if (!payload.createCase) {
    return null;
  }

  const existingCase = await client.query(
    `
    SELECT id
    FROM public.client_cases
    WHERE office_id = $1
      AND party_id = $2
    ORDER BY created_at ASC
    LIMIT 1
    `,
    [officeId, partyId]
  );

  if (existingCase.rows[0]?.id) {
    const caseId = existingCase.rows[0].id as string;

    await client.query(
      `
      UPDATE public.client_cases
      SET
        case_type = $3,
        status = 'active',
        assigned_user_id = $4,
        source = $5,
        notes = $6,
        client_bucket = $7
      WHERE id = $1
        AND office_id = $2
      `,
      [
        caseId,
        officeId,
        payload.caseType,
        payload.assignedUserId ?? userId,
        payload.source,
        payload.notes,
        payload.clientBucket,
      ]
    );

    return caseId;
  }

  const created = await client.query(
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

  return created.rows[0]?.id ?? null;
}

async function syncVisibilityRule(
  client: any,
  officeId: string,
  clientCaseId: string,
  ownerUserId: string,
  visibilityScope: VisibilityScope
) {
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
    ON CONFLICT (client_case_id)
    DO UPDATE SET
      visibility_scope = EXCLUDED.visibility_scope,
      owner_user_id = EXCLUDED.owner_user_id
    `,
    [officeId, clientCaseId, visibilityScope, ownerUserId]
  );
}

async function syncOrderDetails(
  client: any,
  officeId: string,
  clientCaseId: string,
  payload: ContactPayload,
  userId: string
) {
  if (!shouldInsertOrderDetails(payload.caseType)) {
    await client.query(
      `DELETE FROM public.client_case_order_details WHERE client_case_id = $1`,
      [clientCaseId]
    );
    return;
  }

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
    ON CONFLICT (client_case_id)
    DO UPDATE SET
      property_kind = EXCLUDED.property_kind,
      market_type = EXCLUDED.market_type,
      contract_type = EXCLUDED.contract_type,
      caretaker_user_id = EXCLUDED.caretaker_user_id,
      expected_property_kind = EXCLUDED.expected_property_kind,
      search_location_text = EXCLUDED.search_location_text,
      budget_min = EXCLUDED.budget_min,
      budget_max = EXCLUDED.budget_max,
      rooms_min = EXCLUDED.rooms_min,
      rooms_max = EXCLUDED.rooms_max,
      area_min = EXCLUDED.area_min,
      area_max = EXCLUDED.area_max
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

async function syncPropertyDetails(
  client: any,
  officeId: string,
  clientCaseId: string,
  payload: ContactPayload
) {
  if (!shouldInsertPropertyDetails(payload.caseType)) {
    await client.query(
      `DELETE FROM public.client_case_properties WHERE client_case_id = $1`,
      [clientCaseId]
    );
    return;
  }

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
    ON CONFLICT (client_case_id)
    DO UPDATE SET
      country = EXCLUDED.country,
      city = EXCLUDED.city,
      street = EXCLUDED.street,
      building_number = EXCLUDED.building_number,
      unit_number = EXCLUDED.unit_number,
      price_amount = EXCLUDED.price_amount,
      price_currency = EXCLUDED.price_currency,
      price_period = EXCLUDED.price_period,
      area_m2 = EXCLUDED.area_m2,
      rooms_count = EXCLUDED.rooms_count,
      floor_number = EXCLUDED.floor_number,
      floor_total = EXCLUDED.floor_total
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

async function syncOfferInquiry(
  client: any,
  officeId: string,
  clientCaseId: string,
  payload: ContactPayload
) {
  if (!shouldInsertOfferInquiry(payload.caseType)) {
    await client.query(
      `DELETE FROM public.client_case_offer_inquiries WHERE client_case_id = $1`,
      [clientCaseId]
    );
    return;
  }

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
    ON CONFLICT (client_case_id)
    DO UPDATE SET
      offer_id = EXCLUDED.offer_id,
      inquiry_text = EXCLUDED.inquiry_text,
      autofill_from_offer = EXCLUDED.autofill_from_offer,
      autofill_margin_percent = EXCLUDED.autofill_margin_percent
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

async function syncCreditDetails(
  client: any,
  officeId: string,
  clientCaseId: string,
  payload: ContactPayload
) {
  if (!shouldInsertCreditDetails(payload.caseType)) {
    await client.query(
      `DELETE FROM public.client_case_credit_details WHERE client_case_id = $1`,
      [clientCaseId]
    );
    return;
  }

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
    ON CONFLICT (client_case_id)
    DO UPDATE SET
      credited_property_price = EXCLUDED.credited_property_price,
      planned_own_contribution = EXCLUDED.planned_own_contribution,
      loan_period_months = EXCLUDED.loan_period_months,
      concerns_existing_property = EXCLUDED.concerns_existing_property,
      related_offer_id = EXCLUDED.related_offer_id,
      existing_property_notes = EXCLUDED.existing_property_notes
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

async function syncInsuranceDetails(
  client: any,
  officeId: string,
  clientCaseId: string,
  payload: ContactPayload
) {
  if (!shouldInsertInsuranceDetails(payload.caseType)) {
    await client.query(
      `DELETE FROM public.client_case_insurance_details WHERE client_case_id = $1`,
      [clientCaseId]
    );
    return;
  }

  const x = payload.insuranceDetails;

  await client.query(
    `
    INSERT INTO public.client_case_insurance_details (
      office_id,
      client_case_id,
      insurance_subject,
      insurance_notes
    )
    VALUES ($1, $2, $3::public.insurance_subject_type, $4)
    ON CONFLICT (client_case_id)
    DO UPDATE SET
      insurance_subject = EXCLUDED.insurance_subject,
      insurance_notes = EXCLUDED.insurance_notes
    `,
    [
      officeId,
      clientCaseId,
      x.insuranceSubject,
      x.insuranceNotes,
    ]
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = await pool.connect();

  try {
    const userId = mustUserId(req);

    if (req.method !== "PUT") {
      res.setHeader("Allow", "PUT");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const officeId = await getOfficeIdForUserId(userId);
    const payload = normalizePayload(req.body ?? {});

    if (!payload.id) {
      return res.status(400).json({ error: "MISSING_ID" });
    }

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

    const existingParty = await client.query(
      `
      SELECT id, office_id, party_type
      FROM public.parties
      WHERE id = $1
        AND office_id = $2
      LIMIT 1
      `,
      [payload.id, officeId]
    );

    if (!existingParty.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    await client.query(
      `
      UPDATE public.parties
      SET
        party_type = $3::public.party_type,
        full_name = $4,
        notes = $5,
        source = $6,
        assigned_user_id = $7,
        status = $8::public.party_status_type,
        pipeline_stage = $9::public.party_pipeline_stage_type
      WHERE id = $1
        AND office_id = $2
      `,
      [
        payload.id,
        officeId,
        payload.partyType,
        payload.fullName,
        payload.notes,
        payload.source,
        payload.assignedUserId ?? userId,
        payload.status,
        payload.pipelineStage,
      ]
    );

    if (payload.partyType === "person") {
      await client.query(
        `DELETE FROM public.party_company_details WHERE party_id = $1 AND office_id = $2`,
        [payload.id, officeId]
      );

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
        ON CONFLICT (party_id)
        DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          pesel = EXCLUDED.pesel
        `,
        [payload.id, officeId, payload.firstName, payload.lastName, payload.pesel]
      );
    }

    if (payload.partyType === "company") {
      await client.query(
        `DELETE FROM public.party_person_details WHERE party_id = $1 AND office_id = $2`,
        [payload.id, officeId]
      );

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
        ON CONFLICT (party_id)
        DO UPDATE SET
          company_name = EXCLUDED.company_name,
          nip = EXCLUDED.nip,
          regon = EXCLUDED.regon,
          krs = EXCLUDED.krs
        `,
        [
          payload.id,
          officeId,
          payload.companyName ?? payload.fullName,
          payload.nip,
          payload.regon,
          payload.krs,
        ]
      );
    }

    await syncPrimaryContact(client, payload.id, "phone", payload.phone);
    await syncPrimaryContact(client, payload.id, "email", payload.email);

    await syncPartyRoles(client, officeId, payload.id, payload.clientRoles);

    await client.query(
      `
      INSERT INTO public.party_consents (
        office_id,
        party_id,
        kind,
        granted,
        granted_at,
        revoked_at,
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
        $6,
        $7
      )
      ON CONFLICT (party_id, kind)
      DO UPDATE SET
        granted = EXCLUDED.granted,
        granted_at = EXCLUDED.granted_at,
        revoked_at = EXCLUDED.revoked_at,
        source = EXCLUDED.source,
        notes = EXCLUDED.notes
      `,
      [
        officeId,
        payload.id,
        payload.marketingConsent,
        payload.marketingConsent ? new Date().toISOString() : null,
        payload.marketingConsent ? null : new Date().toISOString(),
        payload.source,
        payload.marketingConsentNotes,
      ]
    );

    let clientCaseId: string | null = null;

    if (payload.createCase) {
      clientCaseId = await ensureClientCase(client, officeId, payload.id, userId, payload);

      if (clientCaseId) {
        await syncVisibilityRule(
          client,
          officeId,
          clientCaseId,
          payload.assignedUserId ?? userId,
          payload.visibilityScope
        );

        await syncOrderDetails(client, officeId, clientCaseId, payload, userId);
        await syncPropertyDetails(client, officeId, clientCaseId, payload);
        await syncOfferInquiry(client, officeId, clientCaseId, payload);
        await syncCreditDetails(client, officeId, clientCaseId, payload);
        await syncInsuranceDetails(client, officeId, clientCaseId, payload);
      }
    } else {
      const existingCase = await client.query(
        `
        SELECT id
        FROM public.client_cases
        WHERE office_id = $1
          AND party_id = $2
        ORDER BY created_at ASC
        LIMIT 1
        `,
        [officeId, payload.id]
      );

          if (existingCase.rows[0]?.id) {
        clientCaseId = existingCase.rows[0].id as string;

        await client.query(
          `
          UPDATE public.client_cases
          SET
            status = 'archived',
            client_bucket = 'archive'
          WHERE id = $1
            AND office_id = $2
          `,
          [clientCaseId, officeId]
        );
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
      [payload.id, officeId]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      row: refreshed.rows[0] ?? null,
      clientCaseId,
      updatedCase: Boolean(clientCaseId),
    });
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => null);

    if (e?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("CONTACTS_UPDATE_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  } finally {
    client.release();
  }
}