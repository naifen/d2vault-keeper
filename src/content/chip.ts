/**
 * Light chip DOM — pure enough to unit-test without the content-script entry.
 * Click never opens Workbench (browser user-gesture rules).
 */

export const CHIP_ID = "vault-keeper-light-chip";

export function ensureChip(doc: Document = document): HTMLElement {
  const existing = doc.getElementById(CHIP_ID);
  if (existing) return existing;

  const chip = doc.createElement("button");
  chip.id = CHIP_ID;
  chip.type = "button";
  chip.textContent = "VK";
  chip.title = "Vault Keeper active — open Workbench from the browser sidebar/toolbar";
  chip.setAttribute("aria-label", "Vault Keeper Light (status only; does not open Workbench)");
  Object.assign(chip.style, {
    position: "fixed",
    bottom: "12px",
    right: "12px",
    zIndex: "2147483646",
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    border: "1px solid #c5a572",
    background: "linear-gradient(145deg, #1a1f2e 0%, #0d111a 100%)",
    color: "#e8d5a3",
    fontSize: "11px",
    fontWeight: "700",
    fontFamily: "system-ui, sans-serif",
    cursor: "default",
    boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
    opacity: "0.92",
  });

  chip.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    chip.title = "Open Workbench via browser toolbar or sidebar (not this chip)";
  });

  doc.documentElement.appendChild(chip);
  return chip;
}
