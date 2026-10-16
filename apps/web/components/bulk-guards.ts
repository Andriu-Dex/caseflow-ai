// What a mixed selection cannot do, known before the user confirms. The
// server stays the real guard: it also refuses what only it can see (another
// requirement or use case that depends on one of them).
export function bulkGuards(selected: { version: { status: string } }[]) {
  const total = selected.length;
  const approved = selected.filter((item) => item.version.status === 'APPROVED').length;
  const approveBlocked = total > 0 && approved === total;
  const deleteBlocked = approved > 0;
  let hint: string | null = null;
  if (approveBlocked)
    hint =
      total === 1
        ? 'El elemento seleccionado ya está aprobado: solo se puede archivar.'
        : 'Todos los seleccionados ya están aprobados: solo se pueden archivar.';
  else if (deleteBlocked)
    hint = `${approved} de ${total} seleccionados ya ${approved === 1 ? 'está aprobado' : 'están aprobados'} y solo se ${approved === 1 ? 'puede' : 'pueden'} archivar. Quite su selección para poder eliminar.`;
  return { approveBlocked, deleteBlocked, hint };
}
