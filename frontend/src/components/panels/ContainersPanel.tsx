import { useMemo } from "react";
import { usePersistedState } from "../../hooks/usePersistedState";
import type { ContainerSummary } from "../../types";
import {
  compareText,
  getContainerImage,
  getContainerName,
  getContainerStatus,
  getItemId,
  type ContainerFormState,
  type SortDirection,
} from "../../view-utils";
import {
  ActionButton,
  EmptyRow,
  HighlightText,
  Input,
  PaginationBar,
  SelectField,
  SortableTh,
  Td,
  TextAreaField,
  Th,
} from "../ui";

type ContainerAction = "start" | "stop" | "restart" | "remove";
type ContainerSortKey = "name" | "image" | "status";
type ContainersFilter = {
  query: string;
  status: "all" | "running" | "stopped" | "other";
};

export function ContainersPanel(props: {
  containers: ContainerSummary[];
  page: number;
  pageSize: number;
  total: number;
  filter: ContainersFilter;
  imageOptions: string[];
  networkOptions: string[];
  newContainer: ContainerFormState;
  loading: boolean;
  onFieldChange: (field: keyof ContainerFormState, value: string) => void;
  onRefreshImages: () => void;
  onSubmit: () => void;
  onAction: (action: ContainerAction, id: string) => void;
  onFilterChange: (filter: ContainersFilter) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const [sortBy, setSortBy] = usePersistedState<ContainerSortKey>("panel.containers.sortBy", "name");
  const [sortDirection, setSortDirection] = usePersistedState<SortDirection>("panel.containers.sortDirection", "asc");

  const sortedContainers = useMemo(() => {
    const copied = [...props.containers];
    copied.sort((left, right) => {
      if (sortBy === "image") return compareText(getContainerImage(left), getContainerImage(right), sortDirection);
      if (sortBy === "status") return compareText(getContainerStatus(left), getContainerStatus(right), sortDirection);
      return compareText(getContainerName(left), getContainerName(right), sortDirection);
    });
    return copied;
  }, [props.containers, sortBy, sortDirection]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(props.total / props.pageSize)), [props.pageSize, props.total]);

  function toggleSort(nextSort: ContainerSortKey) {
    if (sortBy === nextSort) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(nextSort);
    setSortDirection("asc");
  }

  return (
    <>
      <div className="mb-4 rounded border bg-white p-4">
        <div className="mb-3 text-sm font-semibold text-slate-700">Create Container</div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex gap-2">
            <select
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={props.newContainer.image}
              onChange={(event) => props.onFieldChange("image", event.target.value)}
            >
              <option value="">Select image</option>
              {props.imageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="shrink-0 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={props.onRefreshImages}
              disabled={props.loading}
            >
              Refresh
            </button>
          </div>

          <Input value={props.newContainer.name} onChange={(value) => props.onFieldChange("name", value)} placeholder="Optional container name" />

          <div>
            <Input
              value={props.newContainer.network}
              onChange={(value) => props.onFieldChange("network", value)}
              placeholder="Optional network, e.g. bridge"
              className="w-full"
            />
            {!!props.networkOptions.length && (
              <div className="mt-1 text-xs text-slate-500">Available: {props.networkOptions.join(" / ")}</div>
            )}
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <div>Multi-value fields support newline or comma separation.</div>
            <div>Volume example: /host/data:/app/data or data-volume:/app/data</div>
            <div>Env example: APP_ENV=prod</div>
          </div>

          <TextAreaField
            value={props.newContainer.ports}
            onChange={(value) => props.onFieldChange("ports", value)}
            placeholder={`Port mappings
8080:80
8443:443`}
            rows={4}
          />

          <TextAreaField
            value={props.newContainer.env}
            onChange={(value) => props.onFieldChange("env", value)}
            placeholder={`Environment variables
APP_ENV=prod
TZ=Asia/Shanghai`}
            rows={4}
          />

          <TextAreaField
            value={props.newContainer.volumes}
            onChange={(value) => props.onFieldChange("volumes", value)}
            placeholder={`Volumes
/host/path:/container/path
my-volume:/app/data`}
            rows={4}
          />

          <TextAreaField
            value={props.newContainer.command}
            onChange={(value) => props.onFieldChange("command", value)}
            placeholder={`Startup command (optional)
sh,-c,echo hello`}
            rows={4}
          />

          <button
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={props.onSubmit}
            disabled={props.loading}
          >
            Create
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded border bg-white p-3">
        <Input
          value={props.filter.query}
          onChange={(query) => props.onFilterChange({ ...props.filter, query })}
          placeholder="Search (server-side)"
          className="min-w-[220px] flex-1"
        />
        <SelectField
          value={props.filter.status}
          onChange={(status) => props.onFilterChange({ ...props.filter, status: status as ContainersFilter["status"] })}
          options={[
            { value: "all", label: "All status" },
            { value: "running", label: "Running" },
            { value: "stopped", label: "Stopped" },
            { value: "other", label: "Other" },
          ]}
        />
        <div className="ml-auto text-xs text-slate-500">
          Page {props.containers.length}, displayed {sortedContainers.length}, total {props.total}
        </div>
      </div>

      <div className="overflow-x-auto rounded border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <SortableTh label="Name" active={sortBy === "name"} direction={sortDirection} onToggle={() => toggleSort("name")} />
              <SortableTh label="Image" active={sortBy === "image"} direction={sortDirection} onToggle={() => toggleSort("image")} />
              <SortableTh label="Status" active={sortBy === "status"} direction={sortDirection} onToggle={() => toggleSort("status")} />
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {!sortedContainers.length && <EmptyRow colSpan={4} text="No matching containers" />}
            {sortedContainers.map((item, index) => {
              const id = getItemId(item);
              const name = getContainerName(item).replace("/", "") || id || "-";
              const image = getContainerImage(item) || "-";
              const status = getContainerStatus(item) || "-";

              return (
                <tr key={`${id}-${index}`} className="border-t">
                  <Td>
                    <HighlightText text={name} query={props.filter.query} />
                  </Td>
                  <Td>
                    <HighlightText text={image} query={props.filter.query} />
                  </Td>
                  <Td>
                    <HighlightText text={status} query={props.filter.query} />
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <ActionButton onClick={() => props.onAction("start", id)} label="Start" disabled={props.loading || !id} />
                      <ActionButton onClick={() => props.onAction("stop", id)} label="Stop" disabled={props.loading || !id} />
                      <ActionButton onClick={() => props.onAction("restart", id)} label="Restart" disabled={props.loading || !id} />
                      <ActionButton onClick={() => props.onAction("remove", id)} label="Remove" danger disabled={props.loading || !id} />
                    </div>
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
