import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSummary } from "../api";
import { setBusinessTerms } from "../terms";

const KEY = ["dashboard-summary"];

/**
 * GET /api/dashboard/summary/ (KPIs of enabled modules only, alerts, industry + terms).
 * Refreshes every minute; keeps the last good payload on a failed refresh.
 */
export default function useDashboardSummary() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => fetchSummary({ signal }).then((d) => {
      if (!d || typeof d !== "object") throw new Error("bad payload");
      return d;
    }),
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
  const summary = q.data || null;

  useEffect(() => {
    if (summary?.terms) {
      setBusinessTerms(summary.terms, {
        business_industry: summary.industry?.set ? summary.industry.key : "",
      });
    }
  }, [summary]);

  const reload = useCallback(() => qc.invalidateQueries({ queryKey: KEY }), [qc]);
  const setSummary = useCallback((fn) => qc.setQueryData(KEY, fn), [qc]);

  return { summary, loading: q.isPending, error: q.isError, reload, setSummary };
}
