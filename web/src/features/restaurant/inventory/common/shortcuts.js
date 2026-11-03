import { useEffect, useRef } from "react";
import useShortcuts from "@shared/common/useShortcuts";

/**
 * Thin layer over the shared `useShortcuts` hook:
 *  - registers every active binding so the F1 help dialog can list them;
 *  - helpers that build the conventional binding sets (dialogs, tabs).
 *
 * Conventions: F2 new, F3 new secondary, Ctrl+D save/confirm, Ctrl+A next,
 * Ctrl+Z previous, Enter confirm, Escape close, F1 help, Alt+1..9 tabs.
 */

const registry = new Set();

/** Like useShortcuts, but the bindings also show up in `collectShortcuts()`. */
export function useRegisteredShortcuts(bindings, opts = {}) {
  useShortcuts(bindings, opts);
  const bRef = useRef(bindings);
  const enabledRef = useRef(opts.enabled !== false);
  useEffect(() => {
    bRef.current = bindings;
    enabledRef.current = opts.enabled !== false;
  });
  useEffect(() => {
    const entry = { get: () => (enabledRef.current ? bRef.current : []) };
    registry.add(entry);
    return () => registry.delete(entry);
  }, []);
}

/** All currently active, labelled bindings (deduplicated) — for the help dialog. */
export function collectShortcuts() {
  const seen = new Set();
  const out = [];
  registry.forEach((entry) => {
    (entry.get() || []).forEach((b) => {
      if (!b || !b.combo || !b.label || b.when === false) return;
      const key = b.combo + "|" + b.label;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ combo: b.combo, label: b.label });
    });
  });
  return out;
}

/**
 * Wrap an Enter handler so it never fires on elements that handle Enter
 * themselves (textarea, buttons, links, selects/comboboxes, checkboxes, menus).
 */
export const onEnter = (fn) => (e) => {
  const el = e?.target;
  if (el && el.tagName) {
    if (["TEXTAREA", "BUTTON", "A", "SELECT"].includes(el.tagName)) return false;
    if (el.tagName === "INPUT" && ["checkbox", "radio", "button", "submit"].includes(el.type)) return false;
    if (el.closest && el.closest('[role="combobox"],[role="listbox"],[role="option"],[role="menuitem"],[role="button"]')) return false;
  }
  return fn(e);
};

/** Ctrl+D / Enter / Escape for a dialog (register from the component that renders it). */
export function dialogBindings(t, { onConfirm, onClose, confirmLabel, enter = true }) {
  const list = [
    { combo: "Ctrl+D", label: confirmLabel || t("shortcuts.save"), handler: onConfirm, scope: "dialog" },
  ];
  if (enter) {
    list.push({
      combo: "Enter", label: t("shortcuts.confirm"), handler: onEnter(onConfirm),
      scope: "dialog", allowInInput: true,
    });
  }
  list.push({ combo: "Escape", label: t("shortcuts.close_dialog"), handler: onClose, scope: "dialog" });
  return list;
}

/** Alt+1..Alt+9 -> switch tab. `tabs` = [{ id, label }]. */
export function tabBindings(t, tabs, onSelect) {
  return tabs.slice(0, 9).map((tab, i) => ({
    combo: `Alt+${i + 1}`,
    label: `${t("shortcuts.tab_n", { n: i + 1 })} — ${tab.label}`,
    handler: () => onSelect(tab.id),
  }));
}

export const helpBinding = (t, onOpen) => ({ combo: "F1", label: t("shortcuts.help"), handler: onOpen });
