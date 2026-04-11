import { useMemo } from "react";
import { usePersistedState } from "../../hooks/usePersistedState";
import type { ImageSummary } from "../../types";
import { compareText, getImageRepository, getImageTag, getItemId, shortId, type SortDirection } from "../../view-utils";
import { EmptyRow, HighlightText, Input, PaginationBar, SortableTh, Td } from "../ui";

type ImageSortKey = "repository" | "tag" | "id";
type ImagesFilter = {
  query: string;
};

export function ImagesPanel(props: {
  images: ImageSummary[];
  page: number;
  pageSize: number;
  total: number;
  filter: ImagesFilter;
  newImage: string;
  loading: boolean;
  pullTaskId: string;
  pullStatus: string;
  pullDone: boolean;
  pullLogs: string[];
  onImageChange: (value: string) => void;
  onFilterChange: (filter: ImagesFilter) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSubmit: () => void;
}) {
  const [sortBy, setSortBy] = usePersistedState<ImageSortKey>("panel.images.sortBy", "repository");
  const [sortDirection, setSortDirection] = usePersistedState<SortDirection>("panel.images.sortDirection", "asc");

  const sortedImages = useMemo(() => {
    const copied = [...props.images];
    copied.sort((left, right) => {
      if (sortBy === "tag") return compareText(getImageTag(left), getImageTag(right), sortDirection);
      if (sortBy === "id") return compareText(getItemId(left), getItemId(right), sortDirection);
      return compareText(getImageRepository(left), getImageRepository(right), sortDirection);
    });
    return copied;
  }, [props.images, sortBy, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize));

  function toggleSort(nextSort: ImageSortKey) {
    if (sortBy === nextSort) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(nextSort);
    setSortDirection("asc");
  }

  return (
    <>
      <div className="mb-4 rounded border bg-white p-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
          <input
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="Image name, e.g. nginx:latest"
            value={props.newImage}
            onChange={(event) => props.onImageChange(event.target.value)}
          />
          <button
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={props.onSubmit}
            disabled={props.loading}
          >
            Pull Image
          </button>
        </div>

        {props.pullTaskId && (
          <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-2">
            <div className="mb-1 text-xs text-slate-600">
              Task: {props.pullTaskId} | Status: {props.pullStatus || "-"} {props.pullDone ? "(done)" : "(running)"}
            </div>
            <pre className="h-40 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{props.pullLogs.join("\n") || "No logs"}</pre>
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded border bg-white p-3">
        <Input
          value={props.filter.query}
          onChange={(query) => props.onFilterChange({ query })}
          placeholder="Search (server-side)"
          className="min-w-[220px] flex-1"
        />
        <div className="ml-auto text-xs text-slate-500">Page {props.images.length}, displayed {sortedImages.length}, total {props.total}</div>
      </div>

      <div className="overflow-x-auto rounded border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <SortableTh label="Repository" active={sortBy === "repository"} direction={sortDirection} onToggle={() => toggleSort("repository")} />
              <SortableTh label="Tag" active={sortBy === "tag"} direction={sortDirection} onToggle={() => toggleSort("tag")} />
              <SortableTh label="ID" active={sortBy === "id"} direction={sortDirection} onToggle={() => toggleSort("id")} />
            </tr>
          </thead>
          <tbody>
            {!sortedImages.length && <EmptyRow colSpan={3} text="No matching images" />}
            {sortedImages.map((item, index) => {
              const repository = getImageRepository(item) || "<none>";
              const tag = getImageTag(item) || "-";
              const id = shortId(getItemId(item));
              return (
                <tr key={`${getItemId(item)}-${index}`} className="border-t">
                  <Td>
                    <HighlightText text={repository} query={props.filter.query} />
                  </Td>
                  <Td>
                    <HighlightText text={tag} query={props.filter.query} />
                  </Td>
                  <Td>
                    <HighlightText text={id} query={props.filter.query} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={props.page}
        totalPages={totalPages}
        pageSize={props.pageSize}
        totalItems={props.total}
        onPageChange={props.onPageChange}
        onPageSizeChange={props.onPageSizeChange}
      />
    </>
  );
}
