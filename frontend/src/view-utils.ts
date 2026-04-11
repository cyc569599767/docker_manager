import type { ContainerSummary } from "./types";

export type ContainerFormState = {
  image: string;
  name: string;
  ports: string;
  env: string;
  volumes: string;
  network: string;
  command: string;
};

export type SortDirection = "asc" | "desc";

export function shortId(text?: string) {
  if (!text) return "-";
  return text.length > 20 ? text.slice(0, 20) : text;
}

export function getItemId(item: { id?: string; Id?: string; ID?: string }) {
  return item.id || item.Id || item.ID || "";
}

export function isRunningContainer(item: ContainerSummary) {
  const state = (item.state || item.State || "").toLowerCase();
  const status = (item.status || item.Status || "").toLowerCase();
  return state === "running" || status.includes("up");
}

export function getContainerStatusCategory(item: ContainerSummary) {
  if (isRunningContainer(item)) return "running";

  const status = getContainerStatus(item).toLowerCase();
  if (status.includes("exited") || status.includes("stopped") || status.includes("created") || status.includes("dead")) {
    return "stopped";
  }

  return "other";
}

export function getContainerName(item: ContainerSummary) {
  return item.names || item.Names || "";
}

export function getContainerImage(item: ContainerSummary) {
  return item.image || item.Image || "";
}

export function getContainerStatus(item: ContainerSummary) {
  return item.status || item.Status || item.state || item.State || "";
}

export function getImageRepository(item: { repository?: string; Repository?: string }) {
  return item.repository || item.Repository || "";
}

export function getImageTag(item: { tag?: string; Tag?: string }) {
  return item.tag || item.Tag || "";
}

export function getVolumeName(item: { name?: string; Name?: string }) {
  return item.name || item.Name || "";
}

export function getVolumeDriver(item: { driver?: string; Driver?: string }) {
  return item.driver || item.Driver || "";
}

export function getVolumeScope(item: { scope?: string; Scope?: string }) {
  return item.scope || item.Scope || "";
}

export function getNetworkName(item: { name?: string; Name?: string }) {
  return item.name || item.Name || "";
}

export function getNetworkDriver(item: { driver?: string; Driver?: string }) {
  return item.driver || item.Driver || "";
}

export function getNetworkScope(item: { scope?: string; Scope?: string }) {
  return item.scope || item.Scope || "";
}

export function normalizeText(value?: string | null) {
  return (value || "").trim().toLocaleLowerCase();
}

export function includesQuery(values: Array<string | null | undefined>, query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;
  return values.some((value) => normalizeText(value).includes(normalizedQuery));
}

export function compareText(a?: string | number | null, b?: string | number | null, direction: SortDirection = "asc") {
  const left = String(a || "");
  const right = String(b || "");
  const result = left.localeCompare(right, "zh-CN", {
    numeric: true,
    sensitivity: "base",
  });
  return direction === "asc" ? result : -result;
}

export function splitListInput(text: string): string[] | undefined {
  const list = text
    .split(/[\r\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

export function validateCreateForm(
  data: Pick<ContainerFormState, "image" | "name" | "ports" | "env" | "volumes" | "network">
): string | null {
  const image = data.image.trim();
  if (!image) return "image 不能为空";
  if (image.includes(" ")) return "image 不能包含空格";

  const name = data.name.trim();
  if (name && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) return "容器名称格式不正确";

  const ports = splitListInput(data.ports) || [];
  for (const port of ports) {
    if (!/^\d{1,5}:\d{1,5}$/.test(port)) return `端口格式错误: ${port}`;
    const [host, container] = port.split(":").map((value) => Number(value));
    if (!(host >= 1 && host <= 65535 && container >= 1 && container <= 65535)) return `端口范围错误: ${port}`;
  }

  const envs = splitListInput(data.env) || [];
  for (const env of envs) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(env)) return `环境变量格式错误: ${env}`;
  }

  const volumes = splitListInput(data.volumes) || [];
  for (const volume of volumes) {
    if (!isLikelyVolumeSpec(volume)) return `挂载格式错误: ${volume}`;
  }

  const network = data.network.trim();
  if (network && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(network)) {
    return "网络名称格式不正确";
  }

  return null;
}

function isLikelyVolumeSpec(value: string) {
  const first = value.indexOf(":");
  const last = value.lastIndexOf(":");
  if (first <= 0) return false;
  if (first === value.length - 1) return false;
  if (first === last) return true;
  if (last === value.length - 1) return false;
  return true;
}
