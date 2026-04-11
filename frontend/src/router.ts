import { useEffect, useState } from "react";
import type { TabKey } from "./state";

const validTabs: TabKey[] = ["containers", "images", "volumes", "networks", "logs", "audit"];

function getTabFromHash(): TabKey {
  const raw = window.location.hash.replace(/^#\/?/, "").trim();
  const tabPart = raw.split("?")[0] as TabKey;
  return validTabs.includes(tabPart) ? tabPart : "containers";
}

export function useHashTabRoute() {
  const [tab, setTab] = useState<TabKey>(() => getTabFromHash());
  const [hash, setHash] = useState(() => window.location.hash || "");

  useEffect(() => {
    const onHashChange = () => {
      setTab(getTabFromHash());
      setHash(window.location.hash || "");
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function navigate(nextTab: TabKey) {
    window.location.hash = `/${nextTab}`;
  }

  return { tab, hash, navigate };
}
