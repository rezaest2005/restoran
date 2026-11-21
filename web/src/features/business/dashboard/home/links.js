import { useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";

/** Navigate to a page of the business app ("pos", "dictionary?tab=users", "dashboard?tab=club") from any route. */
export function useAppNavigate() {
  const navigate = useNavigate();
  const { slug } = useParams();
  return useCallback((path) => {
    const base = slug ? `/${slug}/bizsuite_dashboard/app` : "/bizsuite_dashboard/app";
    navigate(`${base}/${path}`);
  }, [navigate, slug]);
}
