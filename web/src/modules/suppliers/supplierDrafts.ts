import type { components } from '@soltec/shared';
import { addressBodies, addressDraftsOf, type AddressDraft } from '../../components/addressDrafts';
import { newKey, orNull, textOf as text } from '../../components/drafts';
import type { IdentificationType } from '../../components/identification';

type Supplier = components['schemas']['Supplier'];

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
    addresses: addressDraftsOf(supplier?.addresses),
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
    addresses: addressBodies(draft.addresses),
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
