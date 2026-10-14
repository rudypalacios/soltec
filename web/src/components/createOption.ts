/** The id of the extra last option of a searchable select that stands for «create what was typed». */
export const CREATE_ID = '__create__';

/** Whether `text` is worth offering to create: something typed that no option already has. */
export function offersCreate(text: string, names: string[]): boolean {
  const typed = text.trim().toLowerCase();
  return typed !== '' && !names.some((name) => name.trim().toLowerCase() === typed);
}

/** What the option says: «Crear "Panduit"». */
export function createLabel(text: string): string {
  return `Crear "${text.trim()}"`;
}
