
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "@app/App";
import i18n from "./i18n";
import { appName } from "@shared/branding";
import "@shared/tokens.css";
import "@shared/ui/bundle.css";
import "./index.css";
import { installAltHint } from "@shared/ui/altHint";
import { BASE } from "@shared/basePath";
import { installApiPrefix } from "@shared/apiPrefix";
installApiPrefix();
installAltHint();

const syncTitle = () => { document.title = appName(i18n.language); };
syncTitle();
i18n.on("languageChanged", syncTitle);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register(`${BASE}/sw.js`).catch(() => {}));
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 5 * 60 * 1000 },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={BASE || undefined}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
