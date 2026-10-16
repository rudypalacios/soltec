/** What a handover did, in a sentence: «Pasaron 2 contactos. 1 se quedó con su dueño porque …». */
export function handoverSummary(
  clients: number | null,
  result: { contacts_moved: number; contacts_kept: number },
): string {
  const parts: string[] = [];
  if (clients !== null) {
    parts.push(clients === 1 ? 'Se entregó 1 cliente.' : `Se entregaron ${clients} clientes.`);
  } else {
    parts.push('Se reasignó el cliente.');
  }
  if (result.contacts_moved > 0) {
    parts.push(
      result.contacts_moved === 1
        ? 'Pasó 1 contacto.'
        : `Pasaron ${result.contacts_moved} contactos.`,
    );
  }
  if (result.contacts_kept > 0) {
    parts.push(
      result.contacts_kept === 1
        ? '1 contacto se quedó con su dueño porque también está en un cliente que no se entregó.'
        : `${result.contacts_kept} contactos se quedaron con su dueño porque también están en clientes que no se entregaron.`,
    );
  }
  return parts.join(' ');
}
