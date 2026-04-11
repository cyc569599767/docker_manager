import { useEffect } from "react";
import { useFilteredList } from "../../hooks/useFilteredList";
import { usePagination } from "../../hooks/usePagination";
import { usePersistedState } from "../../hooks/usePersistedState";
import type { Network } from "../../types";
import { compareText, getItemId, getNetworkDriver, getNetworkName, getNetworkScope, includesQuery, type SortDirection } from "../../view-utils";
import { EmptyRow, HighlightText, Input, PaginationBar, SortableTh, Td } from "../ui";

type NetworkSortKey = "name" | "driver" | "scope" | "id";

export function NetworksPanel(props: { networks: Network[] }) {
  const [query, setQuery] = usePersistedState<string>("panel.networks.query", "");
  const [sortBy, setSortBy] = usePersistedState<NetworkSortKey>("panel.networks.sortBy", "name");
  const [sortDirection, setSortDirection] = usePersistedState<SortDirection>("panel.networks.sortDirection", "asc");
  const [savedPageSize, setSavedPageSize] = usePersistedState<number>("panel.networks.pageSize", 20);

  const filteredNetworks = useFilteredList({
    items: props.networks,
    query,
    matchesQuery: (item, keyword) => includesQuery([getNetworkName(item), getNetworkDriver(item), getNetworkScope(item), getItemId(item)], keyword),
    sort: (left, right) => {
      if (sortBy === "driver") return compareText(getNetworkDriver(left), getNetworkDriver(right), sortDirection);
      if (sortBy === "scope") return compareText(getNetworkScope(left), getNetworkScope(right), sortDirection);
      if (sortBy === "id") return compareText(getItemId(left), getItemId(right), sortDirection);
      return compareText(getNetworkName(left), getNetworkName(right), sortDirection);
    },
  });

  const { page, pageSize, totalItems, totalPages, pagedItems, setPage, setPageSize } = usePagination(filteredNetworks, savedPageSize);

  useEffect(() => {
    setPage(1);
  }, [query, sortBy, sortDirection, setPage]);

  useEffect(() => {
    setSavedPageSize(pageSize);
  }, [pageSize, setSavedPageSize]);

  function toggleSort(nextSort: NetworkSortKey) {
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
        <Input value={query} onChange={setQuery} placeholder="搜索名称 / 驱动 / 范围 / ID" className="min-w-[220px] flex-1" />
        <div className="ml-auto text-xs text-slate-500">共 {props.networks.length} 条，匹配 {totalItems} 条</div>
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
            {!pagedItems.length && <EmptyRow colSpan={3} text="没有匹配的网络" />}
            {pagedItems.map((item, index) => {
              const name = getNetworkName(item) || "-";
              const driver = getNetworkDriver(item) || "-";
              const scope = getNetworkScope(item) || "-";
              return (
                <tr key={`${getItemId(item)}-${index}`} className="border-t">
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
