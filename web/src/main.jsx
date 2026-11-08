
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
