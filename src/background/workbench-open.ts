/**
 * Open Workbench on toolbar action — browser-specific shell only.
 * Chromium: Side Panel open-on-action-click. Firefox: sidebarAction.open.
 * Light chip must never call this path.
 */

export type WorkbenchOpenTab = {
  id?: number | undefined;
  windowId?: number | undefined;
};

export type WorkbenchOpenApis = {
  sidePanel?: {
    setPanelBehavior: (behavior: {
      openPanelOnActionClick: boolean;
    }) => Promise<void> | void;
    open?: (options: { tabId: number } | { windowId: number }) => Promise<void> | void;
  };
  sidebarAction?: {
    open: () => Promise<void> | void;
  };
  action: {
    onClicked: {
      /** Matches WebExt variance: required tab; optional id/windowId may be undefined. */
      addListener: (callback: (tab: WorkbenchOpenTab, info?: unknown) => void) => void;
    };
  };
};

export type WorkbenchOpenMode = "sidePanel" | "sidebarAction";

/** Pure: map action-click tab → sidePanel.open options (window preferred). */
export function sidePanelOpenOptions(
  tab: WorkbenchOpenTab,
): { tabId: number } | { windowId: number } | undefined {
  if (tab.windowId !== undefined) return { windowId: tab.windowId };
  if (tab.id !== undefined) return { tabId: tab.id };
  return undefined;
}

function installSidePanelGestureFallback(api: WorkbenchOpenApis): void {
  const open = api.sidePanel?.open;
  if (!open) return;
  api.action.onClicked.addListener((tab) => {
    const opts = sidePanelOpenOptions(tab);
    if (!opts) return;
    void settle(() => open(opts)).catch(() => undefined);
  });
}

/** Run work now; convert sync throw or returned thenable into a settled Promise. */
function settle(work: () => Promise<void> | void): Promise<void> {
  try {
    return Promise.resolve(work());
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * Install the toolbar → Workbench open path for the current browser APIs.
 * Returns which mode was installed (for tests / diagnostics).
 */
export function installWorkbenchOpenOnAction(api: WorkbenchOpenApis): WorkbenchOpenMode {
  const setPanelBehavior = api.sidePanel?.setPanelBehavior;
  if (setPanelBehavior) {
    void settle(() => setPanelBehavior({ openPanelOnActionClick: true })).catch(() => {
      // Behavior failed (sync throw or reject) — gesture open if available.
      installSidePanelGestureFallback(api);
    });
    return "sidePanel";
  }

  const sidebarOpen = api.sidebarAction?.open;
  if (sidebarOpen) {
    api.action.onClicked.addListener(() => {
      void settle(() => sidebarOpen()).catch(() => undefined);
    });
    return "sidebarAction";
  }

  // No shell open API — leave action unbound rather than a dead listener.
  return "sidebarAction";
}