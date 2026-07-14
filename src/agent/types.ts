export interface AgentSettings {
  apiKey: string;
  /** OpenRouter-compatible base URL. */
  baseUrl: string;
  model: string;
}

export interface AgentRecommendation {
  id: string;
  itemHash: number;
  name: string;
  reason?: string;
  /** Optional exclusion fields when model or vault enrichment supplies them. */
  tierType?: string;
  tag?: string;
  isExotic?: boolean;
}

export interface AgentResult {
  filters: string[];
  explanation: string;
  recommendations: AgentRecommendation[];
}

export interface AgentVaultSliceRow {
  id: string;
  itemHash: number;
  name: string;
  tierType?: string;
  tag?: string;
  /** Preserved for Favorite/Exotic exclusion post-filter (same signal as Stage). */
  isExotic?: boolean;
}

export interface AgentRequest {
  intention: string;
  /** Only include vault slice when user opted in for this run. */
  vaultContextOptIn: boolean;
  vaultSlice?: AgentVaultSliceRow[];
}

export const AGENT_SETTINGS_KEY = "vault-keeper-agent-settings";

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  apiKey: "",
  baseUrl: "https://openrouter.ai/api/v1",
  model: "openrouter/auto",
};
