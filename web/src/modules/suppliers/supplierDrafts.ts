import type { components } from '@soltec/shared';
import type { IdentificationType } from './identification';

type Supplier = components['schemas']['Supplier'];

/** An address as the form edits it: every field is text, `key` keeps the row stable while rows come and go. */
export interface AddressDraft {
  key: string;
  label: string;
  address: string;
  zone: string;
  country: string;
  isPrimary: boolean;
}

export interface ContactDraft {
  key: string;
  name: string;
  jobTitle: string;
  /** The chosen contact type, with its name so an inactive one still shows what it was. */
  contactType: { id: string; name: string } | null;
  phone: string;
  mobile: string;
  email: string;
  address: string;
  zone: string;
  country: string;
}

export interface SupplierDraft {
  name: string;
  legalName: string;
  identificationType: IdentificationType;
  identification: string;
  creditDays: string;
  creditLimit: string;
  addresses: AddressDraft[];
  contacts: ContactDraft[];
}

let nextKey = 0;
const newKey = () => `row-${(nextKey += 1)}`;
const text = (value: string | null | undefined) => value ?? '';
/** What the API receives for an optional field: nothing when it is empty. */
export const orNull = (value: string) => value.trim() || null;

export const emptyAddress = (isPrimary = false): AddressDraft => ({
  key: newKey(),
  label: '',
  address: '',
  zone: '',
  country: '',
  isPrimary,
});

export const emptyContact = (): ContactDraft => ({
  key: newKey(),
  name: '',
  jobTitle: '',
  contactType: null,
  phone: '',
  mobile: '',
  email: '',
  address: '',
  zone: '',
  country: '',
});

export function draftOf(supplier: Supplier | null): SupplierDraft {
  return {
    name: supplier?.name ?? '',
    legalName: text(supplier?.legal_name),
    identificationType: supplier?.identification_type ?? 'nit',
    identification: text(supplier?.identification),
    creditDays: supplier?.credit_days == null ? '' : String(supplier.credit_days),
    creditLimit: text(supplier?.credit_limit),
    addresses: (supplier?.addresses ?? []).map((address) => ({
      key: newKey(),
      label: address.label,
      address: address.address,
      zone: text(address.zone),
      country: text(address.country),
      isPrimary: address.is_primary === true,
    })),
    contacts: (supplier?.contacts ?? []).map((contact) => ({
      key: newKey(),
      name: contact.name,
      jobTitle: text(contact.job_title),
      contactType: contact.contact_type,
      phone: text(contact.phone),
      mobile: text(contact.mobile),
      email: text(contact.email),
      address: text(contact.address),
      zone: text(contact.zone),
      country: text(contact.country),
    })),
  };
}

/** The body of a save. An empty identification is sent as nothing, and none at all when the type is «none». */
export function bodyOf(draft: SupplierDraft): components['schemas']['SupplierCreate'] {
  return {
    name: draft.name.trim(),
    legal_name: orNull(draft.legalName),
    identification_type: draft.identificationType,
    identification: draft.identificationType === 'none' ? null : orNull(draft.identification),
    credit_days: draft.creditDays.trim() === '' ? null : Number(draft.creditDays),
    credit_limit: orNull(draft.creditLimit),
    addresses: draft.addresses.map((address) => ({
      label: address.label.trim(),
      address: address.address.trim(),
      zone: orNull(address.zone),
      country: orNull(address.country),
      is_primary: address.isPrimary,
    })),
    contacts: draft.contacts.map((contact) => ({
      name: contact.name.trim(),
      job_title: orNull(contact.jobTitle),
      contact_type_id: contact.contactType?.id ?? null,
      phone: orNull(contact.phone),
      mobile: orNull(contact.mobile),
      email: orNull(contact.email),
      address: orNull(contact.address),
      zone: orNull(contact.zone),
      country: orNull(contact.country),
    })),
  };
}
