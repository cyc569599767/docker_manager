import { useEffect } from "react";
import { useFilteredList } from "../../hooks/useFilteredList";
import { usePagination } from "../../hooks/usePagination";
import { usePersistedState } from "../../hooks/usePersistedState";
import { includesQuery } from "../../view-utils";
import { HighlightText, Input, PaginationBar } from "../ui";

export function LogsPanel(props: {
  containerOptions: Array<{ id: string; name: string }>;
  selectedContainerId: string;
  logs: string[];
  loading: boolean;
  onSelectedContainerChange: (id: string) => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = usePersistedState<string>("panel.logs.query", "");
  const [savedPageSize, setSavedPageSize] = usePersistedState<number>("panel.logs.pageSize", 50);

  const filteredLogs = useFilteredList({
    items: props.logs,
    query,
    matchesQuery: (line, keyword) => includesQuery([line], keyword),
  });

  const { page, pageSize, totalItems, totalPages, pagedItems, setPage, setPageSize } = usePagination(filteredLogs, savedPageSize);

  useEffect(() => {
    setPage(1);
  }, [query, setPage]);

  useEffect(() => {
    setSavedPageSize(pageSize);
  }, [pageSize, setSavedPageSize]);

  return (
    <>
      <div className="rounded border bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            value={props.selectedContainerId}
            onChange={(event) => props.onSelectedContainerChange(event.target.value)}
          >
            <option value="">请选择容器</option>
            {props.containerOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:bg-slate-300"
            disabled={!props.selectedContainerId || props.loading}
            onClick={props.onRefresh}
          >
            拉取日志
          </button>
          <div className="ml-auto text-xs text-slate-500">共 {props.logs.length} 行，匹配 {totalItems} 行</div>
        </div>
        <div className="mb-3">
          <Input value={query} onChange={setQuery} placeholder="搜索日志关键字" className="w-full" />
        </div>
        <pre className="h-[60vh] overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
          {pagedItems.length ? (
            pagedItems.map((line, index) => (
              <span key={`${index}-${line.slice(0, 20)}`}>
                <HighlightText text={line} query={query} />
                {"\n"}
              </span>
            ))
          ) : (
            "暂无日志"
          )}
        </pre>
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
