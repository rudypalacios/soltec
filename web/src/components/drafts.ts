let nextKey = 0;
/** A key that keeps a row of a repeating group stable while rows come and go. */
export const newKey = () => `row-${(nextKey += 1)}`;
/** What a form field holds for a value the API may leave out. */
export const textOf = (value: string | null | undefined) => value ?? '';
/** What the API receives for an optional field: nothing when it is empty. */
export const orNull = (value: string) => value.trim() || null;
