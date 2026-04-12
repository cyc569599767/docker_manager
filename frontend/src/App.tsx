import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { StatusBanner } from "./components/header/StatusBanner";
import { SummaryCards, type SummaryCardItem } from "./components/header/SummaryCards";
import { TabBar } from "./components/header/TabBar";
import { AuditPanel } from "./components/panels/AuditPanel";
import { ContainersPanel } from "./components/panels/ContainersPanel";
import { ImagesPanel } from "./components/panels/ImagesPanel";
import { LogsPanel } from "./components/panels/LogsPanel";
import { NetworksPanel } from "./components/panels/NetworksPanel";
import { VolumesPanel } from "./components/panels/VolumesPanel";
import { useContainerMutations } from "./hooks/useContainerMutations";
import { useImagePullTask } from "./hooks/useImagePullTask";
import { useLogsLoader } from "./hooks/useLogsLoader";
import { usePersistedState } from "./hooks/usePersistedState";
import { useHashTabRoute } from "./router";
import { useUiStore, type TabKey } from "./state";
import type { AuditRecord, ContainerSummary, HealthStatus, ImageSummary, Network, Volume } from "./types";
import { getContainerName, getImageRepository, getImageTag, getItemId, getNetworkName, isRunningContainer, type ContainerFormState } from "./view-utils";

type ContainerOption = {
  id: string;
  name: string;
};

type AuditFilter = {
  query: string;
  result: "all" | "success" | "failed";
};

type ContainersFilter = {
  query: string;
  status: "all" | "running" | "stopped" | "other";
};

type ImagesFilter = {
  query: string;
};

const AUDIT_PAGE_LIMIT = 200;
const DEFAULT_AUDIT_FILTER: AuditFilter = { query: "", result: "all" };
const DEFAULT_CONTAINERS_FILTER: ContainersFilter = { query: "", status: "all" };
const DEFAULT_IMAGES_FILTER: ImagesFilter = { query: "" };

function isSameAuditFilter(a: AuditFilter, b: AuditFilter) {
  return a.query === b.query && a.result === b.result;
}

function isSameContainersFilter(a: ContainersFilter, b: ContainersFilter) {
  return a.query === b.query && a.status === b.status;
}

function isSameImagesFilter(a: ImagesFilter, b: ImagesFilter) {
  return a.query === b.query;
}

function parseHashPathAndSearch(hash: string) {
  const raw = hash.replace(/^#\/?/, "").trim();
  const [path, search = ""] = raw.split("?");
  return { path, search };
}

function getAuditFilterFromHash(hash: string): AuditFilter {
  const { path, search } = parseHashPathAndSearch(hash);
  if (path !== "audit") return DEFAULT_AUDIT_FILTER;

  const params = new URLSearchParams(search);
  const query = (params.get("q") || "").trim();
  const resultValue = (params.get("result") || "all").toLowerCase();
  const result: AuditFilter["result"] =
    resultValue === "success" || resultValue === "failed" ? resultValue : "all";

  return { query, result };
}

function buildAuditHash(filter: AuditFilter) {
  const params = new URLSearchParams();
  const query = filter.query.trim();
  if (query) params.set("q", query);
  if (filter.result !== "all") params.set("result", filter.result);

  const search = params.toString();
  return search ? `#/audit?${search}` : "#/audit";
}

function getContainersFilterFromHash(hash: string): ContainersFilter {
  const { path, search } = parseHashPathAndSearch(hash);
  if (path !== "containers") return DEFAULT_CONTAINERS_FILTER;

  const params = new URLSearchParams(search);
  const query = (params.get("q") || "").trim();
  const statusValue = (params.get("status") || "all").toLowerCase();
  const status: ContainersFilter["status"] =
    statusValue === "running" || statusValue === "stopped" || statusValue === "other" ? statusValue : "all";
  return { query, status };
}

function buildContainersHash(filter: ContainersFilter) {
  const params = new URLSearchParams();
  const query = filter.query.trim();
  if (query) params.set("q", query);
  if (filter.status !== "all") params.set("status", filter.status);

  const search = params.toString();
  return search ? `#/containers?${search}` : "#/containers";
}

function getImagesFilterFromHash(hash: string): ImagesFilter {
  const { path, search } = parseHashPathAndSearch(hash);
  if (path !== "images") return DEFAULT_IMAGES_FILTER;

  const params = new URLSearchParams(search);
  const query = (params.get("q") || "").trim();
  return { query };
}

function buildImagesHash(filter: ImagesFilter) {
  const params = new URLSearchParams();
  const query = filter.query.trim();
  if (query) params.set("q", query);

  const search = params.toString();
  return search ? `#/images?${search}` : "#/images";
}

export function App() {
  const { state, dispatch } = useUiStore();
  const { tab, hash, navigate } = useHashTabRoute();
  const hasLoadedInitialDataRef = useRef(false);
  const loadingTaskCountRef = useRef(0);
  const auditAbortControllerRef = useRef<AbortController | null>(null);

  const [containers, setContainers] = useState<ContainerSummary[]>([]);
  const [allContainers, setAllContainers] = useState<ContainerSummary[]>([]);
  const [containersPage, setContainersPage] = useState(1);
  const [containersPageSize, setContainersPageSize] = useState(20);
  const [containersTotal, setContainersTotal] = useState(0);
  const [containersFilter, setContainersFilter] = usePersistedState<ContainersFilter>(
    "panel.containers.serverFilter",
    getContainersFilterFromHash(window.location.hash || "")
  );
  const [debouncedContainersFilter, setDebouncedContainersFilter] = useState<ContainersFilter>(containersFilter);
  const [images, setImages] = useState<ImageSummary[]>([]);
  const [allImages, setAllImages] = useState<ImageSummary[]>([]);
  const [imagesPage, setImagesPage] = useState(1);
  const [imagesPageSize, setImagesPageSize] = useState(20);
  const [imagesTotal, setImagesTotal] = useState(0);
  const [imagesFilter, setImagesFilter] = usePersistedState<ImagesFilter>(
    "panel.images.serverFilter",
    getImagesFilterFromHash(window.location.hash || "")
  );
  const [debouncedImagesFilter, setDebouncedImagesFilter] = useState<ImagesFilter>(imagesFilter);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [auditFilter, setAuditFilter] = useState<AuditFilter>(() => getAuditFilterFromHash(window.location.hash || ""));
  const [debouncedAuditFilter, setDebouncedAuditFilter] = useState<AuditFilter>(() =>
    getAuditFilterFromHash(window.location.hash || "")
  );
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditNextFrom, setAuditNextFrom] = useState(0);
  const [auditLoadingMore, setAuditLoadingMore] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [newContainer, setNewContainer] = useState<ContainerFormState>({
    image: "",
    name: "",
    ports: "",
    env: "",
    volumes: "",
    network: "",
    command: "",
  });

  const loadContainerCatalog = useCallback(async () => setAllContainers(await api.containers()), []);
  const loadContainers = useCallback(
    async (page: number, pageSize: number, filter: ContainersFilter) => {
      const safePage = Math.max(1, Math.floor(page));
      const safePageSize = Math.max(1, Math.floor(pageSize));
      const from = (safePage - 1) * safePageSize;

      const response = await api.containersPage({
        from,
        limit: safePageSize,
        q: filter.query,
        status: filter.status === "all" ? "" : filter.status,
      });
      setContainers(response.items);
      setContainersTotal(response.total);

      if (safePage > 1 && response.total > 0 && from >= response.total) {
        const totalPages = Math.max(1, Math.ceil(response.total / safePageSize));
        setContainersPage(totalPages);
      }
    },
    []
  );
  const loadImageCatalog = useCallback(async () => setAllImages(await api.images()), []);
  const loadImages = useCallback(
    async (page: number, pageSize: number, filter: ImagesFilter) => {
      const safePage = Math.max(1, Math.floor(page));
      const safePageSize = Math.max(1, Math.floor(pageSize));
      const from = (safePage - 1) * safePageSize;

      const response = await api.imagesPage({ from, limit: safePageSize, q: filter.query });
      setImages(response.items);
      setImagesTotal(response.total);

      if (safePage > 1 && response.total > 0 && from >= response.total) {
        const totalPages = Math.max(1, Math.ceil(response.total / safePageSize));
        setImagesPage(totalPages);
      }
    },
    []
  );
  const loadVolumes = useCallback(async () => setVolumes(await api.volumes()), []);
  const loadNetworks = useCallback(async () => setNetworks(await api.networks()), []);
  const loadAudits = useCallback(async (filter: AuditFilter) => {
    auditAbortControllerRef.current?.abort();
    const controller = new AbortController();
    auditAbortControllerRef.current = controller;

    try {
      const response = await api.audit(
        AUDIT_PAGE_LIMIT,
        0,
        filter.query,
        filter.result === "all" ? "" : filter.result,
        controller.signal
      );
      const hasMore = response.hasMore ?? response.has_more ?? false;
      const nextFrom = response.nextFrom ?? response.next_from ?? response.records.length;

      setAudits(response.records);
      setAuditTotal(response.total);
      setAuditHasMore(hasMore);
      setAuditNextFrom(nextFrom);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return;
      }
      throw e;
    } finally {
      if (auditAbortControllerRef.current === controller) {
        auditAbortControllerRef.current = null;
      }
    }
  }, []);

  const loadMoreAudits = useCallback(async (filter: AuditFilter) => {
    if (loading || auditLoadingMore || !auditHasMore) return;

    setAuditLoadingMore(true);
    setError("");
    try {
      const response = await api.audit(
        AUDIT_PAGE_LIMIT,
        auditNextFrom,
        filter.query,
        filter.result === "all" ? "" : filter.result
      );
      const hasMore = response.hasMore ?? response.has_more ?? false;
      const nextFrom = response.nextFrom ?? response.next_from ?? auditNextFrom + response.records.length;

      setAudits((current) => current.concat(response.records));
      setAuditTotal(response.total);
      setAuditHasMore(hasMore);
      setAuditNextFrom(nextFrom);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载更多审计记录失败");
    } finally {
      setAuditLoadingMore(false);
    }
  }, [auditHasMore, auditLoadingMore, auditNextFrom, loading]);
  const loadHealth = useCallback(async () => setHealth(await api.health()), []);

  const loadOverviewData = useCallback(async () => {
    await Promise.all([
      loadHealth(),
      loadContainerCatalog(),
      loadImageCatalog(),
      loadContainers(containersPage, containersPageSize, debouncedContainersFilter),
      loadImages(imagesPage, imagesPageSize, debouncedImagesFilter),
      loadVolumes(),
      loadNetworks(),
    ]);
  }, [
    debouncedContainersFilter,
    debouncedImagesFilter,
    containersPage,
    containersPageSize,
    imagesPage,
    imagesPageSize,
    loadContainerCatalog,
    loadContainers,
    loadHealth,
    loadImageCatalog,
    loadImages,
    loadNetworks,
    loadVolumes,
  ]);

  const loadActiveTabData = useCallback(
    async (activeTab: TabKey, selectedContainerId: string) => {
      if (activeTab === "containers") {
        await Promise.all([
          loadContainers(containersPage, containersPageSize, debouncedContainersFilter),
          allContainers.length ? Promise.resolve() : loadContainerCatalog(),
        ]);
        return;
      }

      if (activeTab === "images") {
        await loadImages(imagesPage, imagesPageSize, debouncedImagesFilter);
        return;
      }

      if (activeTab === "volumes") {
        await loadVolumes();
        return;
      }

      if (activeTab === "networks") {
        await loadNetworks();
        return;
      }

      if (activeTab === "logs") {
        await loadContainerCatalog();
        if (selectedContainerId) {
          setLogs(await api.logs(selectedContainerId));
        } else {
          setLogs([]);
        }
      }
    },
    [
      allContainers.length,
      debouncedContainersFilter,
      debouncedImagesFilter,
      containersPage,
      containersPageSize,
      imagesPage,
      imagesPageSize,
      loadContainerCatalog,
      loadContainers,
      loadImages,
      loadNetworks,
      loadVolumes,
    ]
  );

  const runLoadingTask = useCallback(async (task: () => Promise<void>) => {
    loadingTaskCountRef.current += 1;
    setError("");
    setLoading(true);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "未知错误");
    } finally {
      loadingTaskCountRef.current = Math.max(0, loadingTaskCountRef.current - 1);
      setLoading(loadingTaskCountRef.current > 0);
    }
  }, []);

  const refreshAllData = useCallback(async () => {
    await runLoadingTask(async () => {
      await loadOverviewData();
      if (tab === "audit") {
        await loadAudits(auditFilter);
      }
      if (tab === "logs") {
        if (state.selectedContainerId) {
          setLogs(await api.logs(state.selectedContainerId));
        } else {
          setLogs([]);
        }
      }
    });
  }, [auditFilter, loadAudits, loadOverviewData, runLoadingTask, state.selectedContainerId, tab]);

  useEffect(() => {
    if (hasLoadedInitialDataRef.current) return;

    void (async () => {
      await refreshAllData();
      hasLoadedInitialDataRef.current = true;
    })();
  }, [refreshAllData]);

  useEffect(() => {
    if (!hasLoadedInitialDataRef.current) return;
    void runLoadingTask(() => loadActiveTabData(tab, state.selectedContainerId));
  }, [loadActiveTabData, runLoadingTask, state.selectedContainerId, tab]);

  useEffect(() => {
    if (!hasLoadedInitialDataRef.current) return;
    if (tab !== "containers") return;
    if (allImages.length > 0) return;
    void runLoadingTask(() => loadImageCatalog());
  }, [allImages.length, loadImageCatalog, runLoadingTask, tab]);

  useEffect(() => {
    if (tab !== "audit") return;
    const nextFilter = getAuditFilterFromHash(hash || window.location.hash || "");

    setAuditFilter((current) => (isSameAuditFilter(current, nextFilter) ? current : nextFilter));
    setDebouncedAuditFilter((current) => (isSameAuditFilter(current, nextFilter) ? current : nextFilter));
  }, [hash, tab]);

  useEffect(() => {
    if (tab !== "containers") return;
    const nextFilter = getContainersFilterFromHash(hash || window.location.hash || "");
    const sameFilter = isSameContainersFilter(containersFilter, nextFilter);
    const sameDebounced = isSameContainersFilter(debouncedContainersFilter, nextFilter);
    if (sameFilter && sameDebounced) return;

    setContainersFilter(nextFilter);
    setDebouncedContainersFilter(nextFilter);
    setContainersPage(1);
  }, [containersFilter, debouncedContainersFilter, hash, setContainersFilter, tab]);

  useEffect(() => {
    if (tab !== "images") return;
    const nextFilter = getImagesFilterFromHash(hash || window.location.hash || "");
    const sameFilter = isSameImagesFilter(imagesFilter, nextFilter);
    const sameDebounced = isSameImagesFilter(debouncedImagesFilter, nextFilter);
    if (sameFilter && sameDebounced) return;

    setImagesFilter(nextFilter);
    setDebouncedImagesFilter(nextFilter);
    setImagesPage(1);
  }, [debouncedImagesFilter, hash, imagesFilter, setImagesFilter, tab]);

  useEffect(() => {
    if (!hasLoadedInitialDataRef.current) return;
    if (tab !== "audit") return;
    void runLoadingTask(() => loadAudits(debouncedAuditFilter));
  }, [debouncedAuditFilter, loadAudits, runLoadingTask, tab]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedAuditFilter(auditFilter);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [auditFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedContainersFilter(containersFilter);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [containersFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedImagesFilter(imagesFilter);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [imagesFilter]);

  useEffect(() => {
    if (tab !== "audit") return;
    const nextHash = buildAuditHash(debouncedAuditFilter);
    if ((window.location.hash || "") === nextHash) return;

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${nextHash}`
    );
  }, [debouncedAuditFilter, tab]);

  useEffect(() => {
    if (tab !== "containers") return;
    const nextHash = buildContainersHash(debouncedContainersFilter);
    if ((window.location.hash || "") === nextHash) return;

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${nextHash}`
    );
  }, [debouncedContainersFilter, tab]);

  useEffect(() => {
    if (tab !== "images") return;
    const nextHash = buildImagesHash(debouncedImagesFilter);
    if ((window.location.hash || "") === nextHash) return;

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${nextHash}`
    );
  }, [debouncedImagesFilter, tab]);

  useEffect(() => {
    return () => {
      auditAbortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(imagesTotal / imagesPageSize));
    if (imagesPage > totalPages) {
      setImagesPage(totalPages);
    }
  }, [imagesPage, imagesPageSize, imagesTotal]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(containersTotal / containersPageSize));
    if (containersPage > totalPages) {
      setContainersPage(totalPages);
    }
  }, [containersPage, containersPageSize, containersTotal]);

  useEffect(() => {
    if (!state.selectedContainerId) return;
    const exists = allContainers.some((item) => getItemId(item) === state.selectedContainerId);
    if (exists) return;
    dispatch({ type: "set_selected_container", id: "" });
    setLogs([]);
  }, [allContainers, dispatch, state.selectedContainerId]);

  const containerOptions = useMemo<ContainerOption[]>(
    () =>
      allContainers.map((item) => ({
        id: getItemId(item),
        name: getContainerName(item).replace("/", "") || getItemId(item) || "",
      })),
    [allContainers]
  );

  const imageOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of allImages) {
      const repo = getImageRepository(item);
      const tag = getImageTag(item);
      if (!repo || repo === "<none>" || !tag || tag === "<none>") continue;
      values.add(`${repo}:${tag}`);
    }
    return Array.from(values).sort();
  }, [allImages]);

  const networkOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of networks) {
      const name = getNetworkName(item);
      if (!name) continue;
      values.add(name);
    }
    return Array.from(values).sort();
  }, [networks]);

  const summaryCards = useMemo<SummaryCardItem[]>(
    () => [
      { label: "容器总数", value: allContainers.length },
      { label: "运行中容器", value: allContainers.filter((item) => isRunningContainer(item)).length },
      { label: "镜像总数", value: allImages.length },
      { label: "卷 / 网络", value: `${volumes.length} / ${networks.length}` },
    ],
    [allContainers, allImages.length, networks.length, volumes.length]
  );

  const handleContainerFieldChange = useCallback((field: keyof ContainerFormState, value: string) => {
    setNewContainer((current) => ({ ...current, [field]: value }));
  }, []);

  const handleContainersFilterChange = useCallback((nextFilter: ContainersFilter) => {
    setContainersFilter((current) => {
      if (current.query === nextFilter.query && current.status === nextFilter.status) {
        return current;
      }
      return nextFilter;
    });
    setContainersPage(1);
  }, [setContainersFilter]);

  const handleContainersPageChange = useCallback((page: number) => {
    setContainersPage(Math.max(1, Math.floor(page)));
  }, []);

  const handleContainersPageSizeChange = useCallback((size: number) => {
    const safeSize = Math.max(1, Math.floor(size));
    setContainersPageSize(safeSize);
    setContainersPage(1);
  }, []);

  const handleImagesPageChange = useCallback((page: number) => {
    setImagesPage(Math.max(1, Math.floor(page)));
  }, []);

  const handleImagesPageSizeChange = useCallback((size: number) => {
    const safeSize = Math.max(1, Math.floor(size));
    setImagesPageSize(safeSize);
    setImagesPage(1);
  }, []);

  const handleImagesFilterChange = useCallback((nextFilter: ImagesFilter) => {
    setImagesFilter((current) => {
      if (current.query === nextFilter.query) {
        return current;
      }
      return nextFilter;
    });
    setImagesPage(1);
  }, [setImagesFilter]);

  const reloadAudits = useCallback(() => loadAudits(auditFilter), [auditFilter, loadAudits]);

  const handleAuditFilterChange = useCallback((nextFilter: AuditFilter) => {
    setAuditFilter((current) => {
      if (current.query === nextFilter.query && current.result === nextFilter.result) {
        return current;
      }
      return nextFilter;
    });
  }, []);

  const { doContainerAction, submitCreateContainer } = useContainerMutations({
    selectedContainerId: state.selectedContainerId,
    setLoading,
    setError,
    reloadContainers: async () => {
      await Promise.all([
        loadContainers(containersPage, containersPageSize, debouncedContainersFilter),
        loadContainerCatalog(),
      ]);
    },
    reloadAudits,
  });

  const { newImage, setNewImage, pullDone, pullLogs, pullStatus, pullTaskId, submitPullImage } = useImagePullTask({
    setLoading,
    setError,
    onPullDone: async () => {
      await Promise.all([
        loadImages(imagesPage, imagesPageSize, debouncedImagesFilter),
        loadImageCatalog(),
        reloadAudits(),
      ]);
    },
  });

  const { refreshLogs } = useLogsLoader({
    selectedContainerId: state.selectedContainerId,
    setLoading,
    setError,
    setLogs: (lines) => setLogs(lines),
  });

  async function refreshImageOptions() {
    setLoading(true);
    setError("");
    try {
      await loadImageCatalog();
    } catch (e) {
      setError(e instanceof Error ? e.message : "刷新镜像失败");
    } finally {
      setLoading(false);
    }
  }

  const handleTabChange = useCallback(
    (nextTab: TabKey) => {
      if (nextTab === "containers") {
        window.location.hash = buildContainersHash(containersFilter).replace(/^#/, "");
        return;
      }

      if (nextTab === "images") {
        window.location.hash = buildImagesHash(imagesFilter).replace(/^#/, "");
        return;
      }

      if (nextTab === "audit") {
        window.location.hash = buildAuditHash(auditFilter).replace(/^#/, "");
        return;
      }

      navigate(nextTab);
    },
    [auditFilter, containersFilter, imagesFilter, navigate]
  );

  return (
    <div className="mx-auto max-w-7xl p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Docker 本地维护平台</h1>
      </header>

      <StatusBanner health={health} />
      <SummaryCards cards={summaryCards} />

      <TabBar activeTab={tab} loading={loading} onReload={() => void refreshAllData()} onTabChange={handleTabChange} />

      {error && <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading && <div className="mb-4 text-sm text-slate-500">加载中...</div>}

      {tab === "containers" && (
        <ContainersPanel
          containers={containers}
          page={containersPage}
          pageSize={containersPageSize}
          total={containersTotal}
          filter={containersFilter}
          imageOptions={imageOptions}
          networkOptions={networkOptions}
          loading={loading}
          newContainer={newContainer}
          onAction={(action, id) => void doContainerAction(action, id)}
          onFilterChange={handleContainersFilterChange}
          onFieldChange={handleContainerFieldChange}
          onPageChange={handleContainersPageChange}
          onPageSizeChange={handleContainersPageSizeChange}
          onRefreshImages={() => void refreshImageOptions()}
          onSubmit={() =>
            void submitCreateContainer(newContainer, () =>
              setNewContainer({
                image: "",
                name: "",
                ports: "",
                env: "",
                volumes: "",
                network: "",
                command: "",
              })
            )
          }
        />
      )}

      {tab === "images" && (
        <ImagesPanel
          images={images}
          page={imagesPage}
          pageSize={imagesPageSize}
          total={imagesTotal}
          filter={imagesFilter}
          loading={loading}
          newImage={newImage}
          pullDone={pullDone}
          pullLogs={pullLogs}
          pullStatus={pullStatus}
          pullTaskId={pullTaskId}
          onImageChange={setNewImage}
          onFilterChange={handleImagesFilterChange}
          onPageChange={handleImagesPageChange}
          onPageSizeChange={handleImagesPageSizeChange}
          onSubmit={() => void submitPullImage()}
        />
      )}

      {tab === "volumes" && <VolumesPanel volumes={volumes} />}
      {tab === "networks" && <NetworksPanel networks={networks} />}

      {tab === "logs" && (
        <LogsPanel
          containerOptions={containerOptions}
          loading={loading}
          logs={logs}
          selectedContainerId={state.selectedContainerId}
          onRefresh={() => void refreshLogs()}
          onSelectedContainerChange={(id) => dispatch({ type: "set_selected_container", id })}
        />
      )}

      {tab === "audit" && (
        <AuditPanel
          audits={audits}
          filter={auditFilter}
          total={auditTotal}
          hasMore={auditHasMore}
          loadingMore={auditLoadingMore}
          onFilterChange={handleAuditFilterChange}
          onLoadMore={() => void loadMoreAudits(debouncedAuditFilter)}
        />
      )}
    </div>
  );
}
