import { useCallback } from "react";
import { api } from "../api";
import { splitListInput, type ContainerFormState, validateCreateForm } from "../view-utils";

export type ContainerAction = "start" | "stop" | "restart" | "remove";

export function useContainerMutations(props: {
  selectedContainerId: string;
  setLoading: (value: boolean) => void;
  setError: (message: string) => void;
  reloadContainers: () => Promise<void>;
  reloadAudits: () => Promise<void>;
}) {
  const { reloadAudits, reloadContainers, selectedContainerId, setError, setLoading } = props;

  const doContainerAction = useCallback(
    async (action: ContainerAction, id?: string) => {
      const targetId = id || selectedContainerId;
      if (!targetId) return;

      setLoading(true);
      setError("");
      try {
        if (action === "start") await api.startContainer(targetId);
        if (action === "stop") await api.stopContainer(targetId);
        if (action === "restart") await api.restartContainer(targetId);
        if (action === "remove") await api.removeContainer(targetId);
        await Promise.all([reloadContainers(), reloadAudits()]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "容器操作失败");
      } finally {
        setLoading(false);
      }
    },
    [reloadAudits, reloadContainers, selectedContainerId, setError, setLoading]
  );

  const submitCreateContainer = useCallback(
    async (newContainer: ContainerFormState, onReset: () => void) => {
      const validateMessage = validateCreateForm(newContainer);
      if (validateMessage) return setError(validateMessage);

      setLoading(true);
      setError("");
      try {
        await api.createContainer({
          image: newContainer.image.trim(),
          name: newContainer.name.trim() || undefined,
          ports: splitListInput(newContainer.ports),
          env: splitListInput(newContainer.env),
          volumes: splitListInput(newContainer.volumes),
          network: newContainer.network.trim() || undefined,
          command: splitListInput(newContainer.command),
        });
        onReset();
        await Promise.all([reloadContainers(), reloadAudits()]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "创建容器失败");
      } finally {
        setLoading(false);
      }
    },
    [reloadAudits, reloadContainers, setError, setLoading]
  );

  return { doContainerAction, submitCreateContainer };
}
