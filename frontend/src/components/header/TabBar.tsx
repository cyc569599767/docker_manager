import type { TabKey } from "../../state";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "containers", label: "容器" },
  { key: "images", label: "镜像" },
  { key: "volumes", label: "卷" },
  { key: "networks", label: "网络" },
  { key: "logs", label: "日志" },
  { key: "audit", label: "审计" },
];

export function TabBar(props: {
  activeTab: TabKey;
  loading: boolean;
  onReload: () => void;
  onTabChange: (tab: TabKey) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {tabs.map((tabItem) => (
        <button
          key={tabItem.key}
          onClick={() => props.onTabChange(tabItem.key)}
          disabled={props.loading}
          className={`rounded px-3 py-2 text-sm ${
            props.activeTab === tabItem.key ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-700"
          }`}
        >
          {tabItem.label}
        </button>
      ))}
      <button
        onClick={props.onReload}
        disabled={props.loading}
        className="ml-auto rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        刷新
      </button>
    </div>
  );
}
