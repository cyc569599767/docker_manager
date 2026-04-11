import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { UiStoreProvider } from "./state";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <UiStoreProvider>
      <App />
    </UiStoreProvider>
  </React.StrictMode>
);
