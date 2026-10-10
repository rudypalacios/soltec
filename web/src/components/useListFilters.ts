import { useDeferredValue, useState } from 'react';
import type { StatusValue } from './StatusFilter';

/**
 * The state every list screen keeps: the search text, the status filter and the page. Any filter change goes back
 * to the first page, and the text is deferred so typing does not fire a request per key.
 */
export function useListFilters(initialStatus: StatusValue = 'active') {
  const [text, setText] = useState('');
  const deferredText = useDeferredValue(text);
  const [status, setStatusValue] = useState<StatusValue>(initialStatus);
  const [page, setPage] = useState(0);

  return {
    text,
    setText: (value: string) => {
      setText(value);
      setPage(0);
    },
    /** The text to send to the API: trimmed, and `undefined` when empty. */
    query: deferredText.trim() || undefined,
    status,
    setStatus: (value: StatusValue) => {
      setStatusValue(value);
      setPage(0);
    },
    /** Zero-based, as `TablePagination` wants it; the API is one-based. */
    page,
    setPage,
    /** For a filter that lives outside this hook (the department in the address): back to the first page. */
    resetPage: () => setPage(0),
  };
}
