import { useEffect, useMemo, useState } from "react";

function normalizePageSize(value: number) {
  if (!Number.isFinite(value)) return 20;
  if (value <= 0) return 20;
  return Math.floor(value);
}

export function usePagination<T>(items: T[], initialPageSize = 20) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => normalizePageSize(initialPageSize));

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  function resetPage() {
    setPage(1);
  }

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    pagedItems,
    setPage,
    setPageSize,
    resetPage,
  };
}
