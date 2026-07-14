/**
 * Minimal Chromium Side Panel typings used by the Workbench open adapter.
 * @types/firefox-webext-browser does not model chrome.sidePanel.
 */
declare namespace browser.sidePanel {
  interface PanelBehavior {
    openPanelOnActionClick?: boolean;
  }

  interface OpenOptions {
    tabId?: number;
    windowId?: number;
  }

  function setPanelBehavior(behavior: PanelBehavior): Promise<void>;
  function open(options: OpenOptions): Promise<void>;
}
