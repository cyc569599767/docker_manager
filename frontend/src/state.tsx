import { createContext, useContext, useMemo, useReducer } from "react";
import type { Dispatch, ReactNode } from "react";

export type TabKey = "containers" | "images" | "volumes" | "networks" | "logs" | "audit";

type UiState = {
  selectedContainerId: string;
};

type UiAction = { type: "set_selected_container"; id: string };

const initialState: UiState = {
  selectedContainerId: "",
};

function reducer(state: UiState, action: UiAction): UiState {
  if (action.type === "set_selected_container") return { ...state, selectedContainerId: action.id };
  return state;
}

const UiStoreContext = createContext<{
  state: UiState;
  dispatch: Dispatch<UiAction>;
} | null>(null);

export function UiStoreProvider(props: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <UiStoreContext.Provider value={value}>{props.children}</UiStoreContext.Provider>;
}

export function useUiStore() {
  const ctx = useContext(UiStoreContext);
  if (!ctx) throw new Error("UiStoreProvider is missing");
  return ctx;
}
