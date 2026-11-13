
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "@app/App";
import i18n from "./i18n";
import { appName } from "@shared/branding";
// Fonts are served by this app itself (no request to Google Fonts: it is slow or blocked for many users)
import "@fontsource/vazirmatn/arabic-400.css";
import "@fontsource/vazirmatn/arabic-500.css";
import "@fontsource/vazirmatn/arabic-600.css";
import "@fontsource/vazirmatn/arabic-700.css";
import "@fontsource/vazirmatn/arabic-800.css";
import "@fontsource/vazirmatn/latin-400.css";
import "@fontsource/vazirmatn/latin-500.css";
import "@fontsource/vazirmatn/latin-600.css";
import "@fontsource/vazirmatn/latin-700.css";
import "@fontsource/vazirmatn/latin-800.css";
import "@fontsource/plus-jakarta-sans/latin-400.css";
import "@fontsource/plus-jakarta-sans/latin-500.css";
import "@fontsource/plus-jakarta-sans/latin-600.css";
import "@fontsource/plus-jakarta-sans/latin-700.css";
import "@fontsource/plus-jakarta-sans/latin-800.css";
import "@shared/tokens.css";
import "@shared/ui/bundle.css";
import "./index.css";
import { installAltHint } from "@shared/ui/altHint";
import { installApiPrefix } from "@shared/apiPrefix";
import { BASE } from "@shared/basePath";
installApiPrefix();

// Older builds installed a service worker for the whole site. Only the courier pages may have one now, so remove ours
// everywhere else (a worker of ANOTHER application on this domain is never touched: only our own script address matches).
if ("serviceWorker" in navigator && !window.location.pathname.includes("/bizsuite_driver")) {
  navigator.serviceWorker.getRegistrations().then((list) => list.forEach((r) => {
    const url = (r.active || r.waiting || r.installing)?.scriptURL || "";
    if (url === `${window.location.origin}${BASE}/sw.js` && !r.scope.includes("/bizsuite_driver")) r.unregister();
  })).catch(() => {});
}
installAltHint();

const syncTitle = () => { document.title = appName(i18n.language); };
syncTitle();
i18n.on("languageChanged", syncTitle);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 5 * 60 * 1000 },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
