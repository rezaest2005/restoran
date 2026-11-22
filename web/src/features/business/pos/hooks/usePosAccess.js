import { hasTab } from "@business/dashboard/access";

/**
 * What the signed-in cashier may do at the till. Each flag is the server's effective permission
 * (licence ∩ what the owner ticked) from the session payload; the API enforces the same keys.
 */
export default function usePosAccess() {
  return {
    canDiscount: hasTab("pos_discount"),
    canEditPrice: hasTab("pos_price_edit"),
    canCancel: hasTab("pos_cancel_order"),
    canPayCash: hasTab("pos_pay_cash"),
    canPayCard: hasTab("pos_pay_card"),
    canPastDays: hasTab("pos_past_days"),
    canCloseDay: hasTab("pos_close_day"),
  };
}

/** Cash needs its own permission; every other way of paying (card, online, terminal) needs the card/online one. */
export const canUseMethod = (access, method) => (method === "cash" ? access.canPayCash : access.canPayCard);
