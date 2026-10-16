import type { components } from '@soltec/shared';
import { newKey, orNull, textOf } from './drafts';

type Address = components['schemas']['SupplierAddress'];

/** An address as the form edits it: every field is text, `key` keeps the row stable while rows come and go. */
export interface AddressDraft {
  key: string;
  label: string;
  address: string;
  zone: string;
  country: string;
  isPrimary: boolean;
}

export const emptyAddress = (isPrimary = false): AddressDraft => ({
  key: newKey(),
  label: '',
  address: '',
  zone: '',
  country: '',
  isPrimary,
});

export const addressDraftsOf = (addresses: readonly Address[] | undefined): AddressDraft[] =>
  (addresses ?? []).map((address) => ({
    key: newKey(),
    label: address.label,
    address: address.address,
    zone: textOf(address.zone),
    country: textOf(address.country),
    isPrimary: address.is_primary === true,
  }));

export const addressBodies = (drafts: readonly AddressDraft[]): Address[] =>
  drafts.map((address) => ({
    label: address.label.trim(),
    address: address.address.trim(),
    zone: orNull(address.zone),
    country: orNull(address.country),
    is_primary: address.isPrimary,
  }));
