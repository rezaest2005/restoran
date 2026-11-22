import { useEffect, useState } from "react";
import { getCardSettings } from "../services/cardTerminal";

/** Card terminal settings of this business (read-only for the checkout; edited in the settings tab). */
export default function useCardReaderSettings() {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    let alive = true;
    getCardSettings()
      .then((d) => { if (alive) setSettings(d.settings || null); })
      .catch(() => { if (alive) setSettings(null); });   // no POS access / offline: the terminal option stays hidden
    return () => { alive = false; };
  }, []);

  return { cardSettings: settings, setCardSettings: setSettings };
}
