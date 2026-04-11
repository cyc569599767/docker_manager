import { useCallback, useMemo, useState } from "react";

function readFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function usePersistedState<T>(key: string, initialValue: T) {
  const stableKey = useMemo(() => key, [key]);
  const [value, setValue] = useState<T>(() => readFromStorage(stableKey, initialValue));

  const updateValue = useCallback(
    (next: T | ((current: T) => T)) => {
      setValue((current) => {
        const resolved = typeof next === "function" ? (next as (current: T) => T)(current) : next;
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(stableKey, JSON.stringify(resolved));
          } catch {
            // ignore storage failure
          }
        }
        return resolved;
      });
    },
    [stableKey]
  );

  return [value, updateValue] as const;
}
