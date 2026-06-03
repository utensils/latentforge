export interface DatasetConfig {
  name?: string;
  subject?: string;
  trigger_word?: string;
  output_dir?: string;
  search_queries?: Record<string, string[]>;
  wikimedia_queries?: Array<{ prefix: string; query?: string }>;
  categories?: Record<string, string>;
  curation?: {
    target_count?: string;
    min_resolution?: number;
    training_resolution?: number;
  };
}

export interface ToolDetails {
  ok: boolean;
  [key: string]: unknown;
}

export interface SlashCommandResult {
  text: string;
}

export interface BingSearchResult {
  url: string;
  width?: number;
  height?: number;
}
