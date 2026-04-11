import { useCallback } from "react";
import { api } from "../api";

export function useLogsLoader(props: {
  selectedContainerId: string;
  setLoading: (value: boolean) => void;
  setError: (message: string) => void;
  setLogs: (lines: string[]) => void;
}) {
  const { selectedContainerId, setError, setLoading, setLogs } = props;

  const refreshLogs = useCallback(async () => {
    if (!selectedContainerId) return;

    setLoading(true);
    setError("");
    try {
      setLogs(await api.logs(selectedContainerId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载日志失败");
    } finally {
      setLoading(false);
    }
  }, [selectedContainerId, setError, setLoading, setLogs]);

  return { refreshLogs };
}
