import { apiBase } from "../../api";
import type { HealthStatus } from "../../types";

export function StatusBanner(props: { health: HealthStatus | null }) {
  const dockerVersion = props.health?.dockerVersion || props.health?.docker_version || "-";
  const connected = dockerVersion !== "-" && dockerVersion !== "unknown";

  return (
    <section
      className={`mb-4 rounded border p-3 text-sm ${
        connected ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      <div className="font-medium">{connected ? "后端已连接 Docker Engine" : "后端已启动，但 Docker Engine 状态未知"}</div>
      <div className="mt-1 text-xs opacity-80">API：{apiBase} · Docker 版本：{dockerVersion}</div>
    </section>
  );
}
