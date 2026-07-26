
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { useAppStore } from "./store/app";
import "@fontsource-variable/inter";
import "./styles/theme.css";
import "./styles/global.css";


document.documentElement.setAttribute("data-theme", useAppStore.getState().theme);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
