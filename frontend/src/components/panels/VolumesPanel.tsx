import { useEffect } from "react";
import { useFilteredList } from "../../hooks/useFilteredList";
import { usePagination } from "../../hooks/usePagination";
import { usePersistedState } from "../../hooks/usePersistedState";
import type { Volume } from "../../types";
import { compareText, getVolumeDriver, getVolumeName, getVolumeScope, includesQuery, type SortDirection } from "../../view-utils";
import { EmptyRow, HighlightText, Input, PaginationBar, SortableTh, Td } from "../ui";

type VolumeSortKey = "name" | "driver" | "scope";

export function VolumesPanel(props: { volumes: Volume[] }) {
  const [query, setQuery] = usePersistedState<string>("panel.volumes.query", "");
  const [sortBy, setSortBy] = usePersistedState<VolumeSortKey>("panel.volumes.sortBy", "name");
  const [sortDirection, setSortDirection] = usePersistedState<SortDirection>("panel.volumes.sortDirection", "asc");
  const [savedPageSize, setSavedPageSize] = usePersistedState<number>("panel.volumes.pageSize", 20);

  const filteredVolumes = useFilteredList({
    items: props.volumes,
    query,
    matchesQuery: (item, keyword) => includesQuery([getVolumeName(item), getVolumeDriver(item), getVolumeScope(item)], keyword),
    sort: (left, right) => {
      if (sortBy === "driver") return compareText(getVolumeDriver(left), getVolumeDriver(right), sortDirection);
      if (sortBy === "scope") return compareText(getVolumeScope(left), getVolumeScope(right), sortDirection);
      return compareText(getVolumeName(left), getVolumeName(right), sortDirection);
    },
  });

  const { page, pageSize, totalItems, totalPages, pagedItems, setPage, setPageSize } = usePagination(filteredVolumes, savedPageSize);

  useEffect(() => {
    setPage(1);
  }, [query, sortBy, sortDirection, setPage]);

  useEffect(() => {
    setSavedPageSize(pageSize);
  }, [pageSize, setSavedPageSize]);

  function toggleSort(nextSort: VolumeSortKey) {
    if (sortBy === nextSort) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(nextSort);
    setSortDirection("asc");
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded border bg-white p-3">
        <Input value={query} onChange={setQuery} placeholder="搜索名称 / 驱动 / 范围" className="min-w-[220px] flex-1" />
        <div className="ml-auto text-xs text-slate-500">共 {props.volumes.length} 条，匹配 {totalItems} 条</div>
      </div>

      <div className="overflow-x-auto rounded border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <SortableTh label="名称" active={sortBy === "name"} direction={sortDirection} onToggle={() => toggleSort("name")} />
              <SortableTh label="驱动" active={sortBy === "driver"} direction={sortDirection} onToggle={() => toggleSort("driver")} />
              <SortableTh label="范围" active={sortBy === "scope"} direction={sortDirection} onToggle={() => toggleSort("scope")} />
            </tr>
          </thead>
          <tbody>
            {!pagedItems.length && <EmptyRow colSpan={3} text="没有匹配的卷" />}
            {pagedItems.map((item, index) => {
              const name = getVolumeName(item) || "-";
              const driver = getVolumeDriver(item) || "-";
              const scope = getVolumeScope(item) || "-";
              return (
                <tr key={`${getVolumeName(item)}-${index}`} className="border-t">
                  <Td>
                    <HighlightText text={name} query={query} />
                  </Td>
                  <Td>
                    <HighlightText text={driver} query={query} />
                  </Td>
                  <Td>
                    <HighlightText text={scope} query={query} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={page}
        totalPages={totalPages}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </>
  );
}
