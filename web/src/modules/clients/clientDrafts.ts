import type { components } from '@soltec/shared';
import { addressBodies, addressDraftsOf, type AddressDraft } from '../../components/addressDrafts';
import { orNull, textOf } from '../../components/drafts';
import type { IdentificationType } from '../../components/identification';

type Client = components['schemas']['Client'];
type BillingProfile = components['schemas']['BillingProfile'];

/** The billing profile as the form edits it. The ids are `''` for «none chosen». */
export interface BillingDraft {
  legalName: string;
  taxRegimeId: string;
  paymentMethodId: string;
  creditDays: string;
  creditLimit: string;
}

export interface ClientDraft {
  name: string;
  identificationType: IdentificationType;
  identification: string;
  statusId: string;
  segmentId: string;
  areaId: string;
  marginLevelId: string;
  addresses: AddressDraft[];
  /** Only a customer has one; a prospect gets it when it is converted. */
  billing: BillingDraft | null;
}

export const emptyBilling = (): BillingDraft => ({
  legalName: '',
  taxRegimeId: '',
  paymentMethodId: '',
  creditDays: '',
  creditLimit: '',
});

const billingDraftOf = (profile: BillingProfile): BillingDraft => ({
  legalName: profile.legal_name,
  taxRegimeId: profile.tax_regime?.id ?? '',
  paymentMethodId: profile.payment_method?.id ?? '',
  creditDays: profile.credit_days === null ? '' : String(profile.credit_days),
  creditLimit: textOf(profile.credit_limit),
});

/** A new prospect starts without an identification: many are registered before anyone asks for one. */
export function draftOf(client: Client | null): ClientDraft {
  return {
    name: client?.name ?? '',
    identificationType: client?.identification_type ?? 'none',
    identification: textOf(client?.identification),
    statusId: client?.status?.id ?? '',
    segmentId: client?.segment?.id ?? '',
    areaId: client?.area?.id ?? '',
    marginLevelId: client?.margin_level?.id ?? '',
    addresses: addressDraftsOf(client?.addresses),
    billing: client?.billing_profile ? billingDraftOf(client.billing_profile) : null,
  };
}

export function billingBody(draft: BillingDraft): components['schemas']['BillingProfileInput'] {
  return {
    legal_name: draft.legalName.trim(),
    tax_regime_id: draft.taxRegimeId,
    payment_method_id: draft.paymentMethodId || null,
    credit_days: draft.creditDays.trim() === '' ? null : Number(draft.creditDays),
    credit_limit: orNull(draft.creditLimit),
  };
}

/** The body of a save. An empty identification is sent as nothing, and none at all when the type is «none». */
export function bodyOf(draft: ClientDraft): components['schemas']['ClientCreate'] {
  return {
    name: draft.name.trim(),
    identification_type: draft.identificationType,
    identification: draft.identificationType === 'none' ? null : orNull(draft.identification),
    status_id: draft.statusId || null,
    segment_id: draft.segmentId || null,
    area_id: draft.areaId || null,
    margin_level_id: draft.marginLevelId || null,
    addresses: addressBodies(draft.addresses),
  };
}
