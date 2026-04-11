import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

export function useImagePullTask(props: {
  setLoading: (value: boolean) => void;
  setError: (message: string) => void;
  onPullDone: () => Promise<void>;
}) {
  const { onPullDone, setError, setLoading } = props;

  const [newImage, setNewImage] = useState("");
  const [pullTaskId, setPullTaskId] = useState("");
  const [pullLogs, setPullLogs] = useState<string[]>([]);
  const [pullNextFrom, setPullNextFrom] = useState(0);
  const [pullDone, setPullDone] = useState(true);
  const [pullStatus, setPullStatus] = useState("");
  const pullingRef = useRef(false);

  const submitPullImage = useCallback(async () => {
    const image = newImage.trim();
    if (!image) return setError("请输入镜像名");
    if (image.includes(" ")) return setError("镜像名不能包含空格");

    setLoading(true);
    setError("");
    try {
      const res = await api.pullImage(image);
      const taskId = res.taskId || res.task_id;
      if (!taskId) {
        throw new Error("镜像拉取任务未返回 taskId");
      }
      setPullTaskId(taskId);
      setPullLogs([`任务已启动: ${taskId}`]);
      setPullNextFrom(0);
      setPullDone(false);
      setPullStatus("running");
      setNewImage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "镜像拉取失败");
    } finally {
      setLoading(false);
    }
  }, [newImage, setError, setLoading]);

  const pollPullProgress = useCallback(async () => {
    if (!pullTaskId || pullDone || pullingRef.current) return;
    pullingRef.current = true;

    try {
      const res = await api.pullImageProgress(pullTaskId, pullNextFrom);
      setPullStatus(res.status);
      setPullNextFrom(res.nextFrom ?? res.next_from ?? 0);
      if (res.logs.length) {
        setPullLogs((current) => current.concat(res.logs));
      }
      if (res.done) {
        setPullDone(true);
        if (res.error) setError(res.error);
        await onPullDone();
      }
    } catch (e) {
      setPullDone(true);
      setError(e instanceof Error ? e.message : "获取拉取进度失败");
    } finally {
      pullingRef.current = false;
    }
  }, [onPullDone, pullDone, pullNextFrom, pullTaskId, setError]);

  useEffect(() => {
    if (!pullTaskId || pullDone) return;
    void pollPullProgress();
    const timer = window.setInterval(() => void pollPullProgress(), 1000);
    return () => window.clearInterval(timer);
  }, [pollPullProgress, pullDone, pullTaskId]);

  return {
    newImage,
    setNewImage,
    pullTaskId,
    pullLogs,
    pullDone,
    pullStatus,
    submitPullImage,
  };
}
