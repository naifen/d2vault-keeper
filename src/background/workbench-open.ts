/**
 * Open Workbench on toolbar action — browser-specific shell only.
 * Chromium: Side Panel open-on-action-click. Firefox: sidebarAction.open.
 * Light chip must never call this path.
 */

export type WorkbenchOpenApis = {
  sidePanel?: {
    setPanelBehavior: (behavior: {
      openPanelOnActionClick: boolean;
    }) => Promise<void> | void;
    open?: (options: { tabId?: number; windowId?: number }) => Promise<void> | void;
  };
  sidebarAction?: {
    open: () => Promise<void> | void;
  };
  action: {
    onClicked: {
      addListener: (
        callback: (tab?: { id?: number; windowId?: number }) => void,
      ) => void;
    };
  };
};

export type WorkbenchOpenMode = "sidePanel" | "sidebarAction";

function installSidePanelGestureFallback(api: WorkbenchOpenApis): void {
  if (!api.sidePanel?.open) return;
  api.action.onClicked.addListener((tab) => {
    const open = api.sidePanel?.open;
    if (!open) return;
    const opts =
      tab?.windowId !== undefined
        ? { windowId: tab.windowId }
        : tab?.id !== undefined
          ? { tabId: tab.id }
          : undefined;
    if (!opts) return;
    void Promise.resolve(open(opts)).catch(() => undefined);
  });
}

/**
 * Install the toolbar → Workbench open path for the current browser APIs.
 * Returns which mode was installed (for tests / diagnostics).
 */
export function installWorkbenchOpenOnAction(api: WorkbenchOpenApis): WorkbenchOpenMode {
  if (api.sidePanel?.setPanelBehavior) {
    void Promise.resolve(
      api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }),
    ).catch(() => {
      // Behavior failed (e.g. missing permission) — still try gesture open.
      installSidePanelGestureFallback(api);
    });
    return "sidePanel";
  }

  api.action.onClicked.addListener(() => {
    void Promise.resolve(api.sidebarAction?.open()).catch(() => undefined);
  });
  return "sidebarAction";
}
