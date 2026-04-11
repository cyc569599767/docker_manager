import { useEffect } from "react";
import { useFilteredList } from "../../hooks/useFilteredList";
import { usePagination } from "../../hooks/usePagination";
import { usePersistedState } from "../../hooks/usePersistedState";
import type { AuditRecord } from "../../types";
import { compareText, includesQuery, shortId, type SortDirection } from "../../view-utils";
import { EmptyRow, HighlightText, Input, PaginationBar, SelectField, SortableTh, Td } from "../ui";

type AuditSortKey = "time" | "action" | "result";

type AuditFilter = {
  query: string;
  result: "all" | "success" | "failed";
};

export function AuditPanel(props: {
  audits: AuditRecord[];
  filter: AuditFilter;
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  onFilterChange: (filter: AuditFilter) => void;
  onLoadMore: () => void;
}) {
  const [sortBy, setSortBy] = usePersistedState<AuditSortKey>("panel.audit.sortBy", "time");
  const [sortDirection, setSortDirection] = usePersistedState<SortDirection>("panel.audit.sortDirection", "desc");
  const [savedPageSize, setSavedPageSize] = usePersistedState<number>("panel.audit.pageSize", 20);

  const filteredAudits = useFilteredList({
    items: props.audits,
    query: props.filter.query,
    matchesQuery: (item, keyword) => includesQuery([item.action, item.target, item.result, item.detail, item.at], keyword),
    filter: (item) => props.filter.result === "all" || item.result === props.filter.result,
    sort: (left, right) => {
      if (sortBy === "action") return compareText(left.action, right.action, sortDirection);
      if (sortBy === "result") return compareText(left.result, right.result, sortDirection);
      return compareText(new Date(left.at).getTime(), new Date(right.at).getTime(), sortDirection);
    },
  });

  const { page, pageSize, totalItems, totalPages, pagedItems, setPage, setPageSize } = usePagination(filteredAudits, savedPageSize);

  useEffect(() => {
    setPage(1);
  }, [props.filter.query, props.filter.result, sortBy, sortDirection, setPage]);

  useEffect(() => {
    setSavedPageSize(pageSize);
  }, [pageSize, setSavedPageSize]);

  function toggleSort(nextSort: AuditSortKey) {
    if (sortBy === nextSort) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(nextSort);
    setSortDirection(nextSort === "time" ? "desc" : "asc");
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded border bg-white p-3">
        <Input
          value={props.filter.query}
          onChange={(query) => props.onFilterChange({ ...props.filter, query })}
          placeholder="搜索动作 / 目标 / 结果 / 详情"
          className="min-w-[220px] flex-1"
        />
        <SelectField
          value={props.filter.result}
          onChange={(result) => props.onFilterChange({ ...props.filter, result: result as AuditFilter["result"] })}
          options={[
            { value: "all", label: "全部结果" },
            { value: "success", label: "成功" },
            { value: "failed", label: "失败" },
          ]}
        />
        <div className="ml-auto text-xs text-slate-500">
          已加载 {props.audits.length} / 总计 {props.total}，当前匹配 {totalItems} 条
        </div>
      </div>

      <div className="overflow-x-auto rounded border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <SortableTh label="时间" active={sortBy === "time"} direction={sortDirection} onToggle={() => toggleSort("time")} />
              <SortableTh label="动作" active={sortBy === "action"} direction={sortDirection} onToggle={() => toggleSort("action")} />
              <ThLabel value="目标" />
              <SortableTh label="结果" active={sortBy === "result"} direction={sortDirection} onToggle={() => toggleSort("result")} />
              <ThLabel value="详情" />
            </tr>
          </thead>
          <tbody>
            {!pagedItems.length && <EmptyRow colSpan={5} text="没有匹配的审计记录" />}
            {pagedItems.map((item, index) => (
              <tr key={`${item.at}-${index}`} className="border-t">
                <Td>{new Date(item.at).toLocaleString()}</Td>
                <Td>
                  <HighlightText text={item.action} query={props.filter.query} />
                </Td>
                <Td>
                  <HighlightText text={shortId(item.target)} query={props.filter.query} />
                </Td>
                <Td>
                  <HighlightText text={item.result} query={props.filter.query} />
                </Td>
                <Td>
                  <HighlightText text={item.detail || "-"} query={props.filter.query} />
                </Td>
              </tr>
            ))}
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

      {props.hasMore && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={props.loadingMore}
            onClick={props.onLoadMore}
          >
            {props.loadingMore ? "加载中..." : "加载更多审计记录"}
          </button>
        </div>
      )}
    </>
  );
}

function ThLabel(props: { value: string }) {
  return <th className="px-3 py-2 text-left font-semibold text-slate-700">{props.value}</th>;
}
