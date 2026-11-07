import { createContext, useContext } from "react";

/** The business whose storefront is being edited (set by StorefrontEditor). */
export const BusinessContext = createContext(null);
export const useBusinessId = () => useContext(BusinessContext);
