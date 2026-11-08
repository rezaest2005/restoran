/** وقتی Alt نگه داشته شده، کلاس kbd-alt روی body قرار می‌گیرد (برای .ks-alt-hint). */
export function installAltHint() {
  const on = () => document.body.classList.add("kbd-alt");
  const off = () => document.body.classList.remove("kbd-alt");
  window.addEventListener("keydown", (e) => { if (e.key === "Alt") on(); });
  window.addEventListener("keyup", (e) => { if (e.key === "Alt") off(); });
  window.addEventListener("blur", off);
}
