/* Generated from schema.json by npm run schema:types. Do not edit. */

export type Asset = AudioAsset | ImageAsset;
export type Id = string;
export type Scene = {
  [k: string]: unknown;
} & {
  id: Id;
  type:
    | "title_reveal"
    | "card_sequence"
    | "flow_diagram"
    | "code_walkthrough"
    | "comparison_panel"
    | "state_diagram"
    | "execution_timeline"
    | "data_chart"
    | "concept";
  /**
   * @minItems 1
   * @maxItems 2
   */
  images?: ImageBinding[];
  motif?: "default" | "funnel" | "dialogue_split" | "means_row" | "schematic";
  chart?: Chart;
  dialogue?: Dialogue;
  process?: Process;
  funnel?: Funnel;
  timeline?: {
    duration_ms: number;
    /**
     * @minItems 1
     * @maxItems 3
     */
    lanes: {
      id: Id;
      label: string;
    }[];
  };
  structure?: {
    kind: "array" | "object" | "stack";
    name: string;
  };
  code?: {
    array_name?: string;
    language: "python" | "javascript" | "typescript" | "java" | "cpp" | "text";
    source: string;
  };
  narration: {
    text: string;
    audio_asset_id: Id;
    audio_start_frame: 6;
  };
  duration_frames: number;
  /**
   * @minItems 1
   * @maxItems 6
   */
  elements: Element[];
  /**
   * @maxItems 15
   */
  edges?: {
    from: Id;
    to: Id;
  }[];
  /**
   * @maxItems 12
   */
  visual_actions?: VisualAction[];
  camera?: {
    x: number;
    y: number;
    scale: number;
  };
  vector?: {
    kind: "stroke_curve" | "gauge" | "tradeoff_triangle" | "dot_funnel";
  };
  section?: "intro" | "two_extremes" | "solution" | "layers" | "tradeoff" | "conclusion";
  /**
   * @minItems 1
   * @maxItems 6
   */
  animations: {
    target: Id;
    effect: "fade_slide" | "draw" | "scale_pop" | "box" | "shake";
    start_frame: number;
    duration_frames: number;
  }[];
  /**
   * @minItems 1
   * @maxItems 500
   */
  captions: {
    text: string;
    start_frame: number;
    end_frame: number;
  }[];
};
export type Chart = {
  [k: string]: unknown;
} & {
  kind: "bar" | "line" | "proportion" | "matrix";
  title: string;
  unit: string;
  source_note: string;
  confirmed: true;
  /**
   * @minItems 1
   * @maxItems 6
   */
  columns?: string[];
  /**
   * @minItems 1
   * @maxItems 6
   */
  data: {
    element_id: Id;
    label: string;
    /**
     * @minItems 1
     * @maxItems 6
     */
    values: number[];
  }[];
};
export type VisualAction = {
  [k: string]: unknown;
} & {
  kind: "connect" | "highlight" | "update";
  target: Id;
  to?: Id;
  source?: Id;
  cue: {
    text_start: number;
    text_end: number;
  };
  start_frame: number;
  duration_frames: number;
};

export interface VideoProject {
  schema_version: "1.0";
  theme: "tech_explainer" | "tech_multicolor" | "light_teaching" | "color_infographic";
  video_config: {
    width: 1920;
    height: 1080;
    fps: 30;
    language: "zh-CN";
  };
  /**
   * @minItems 1
   * @maxItems 60
   */
  assets: Asset[];
  /**
   * @minItems 1
   * @maxItems 20
   */
  scenes: Scene[];
}
export interface AudioAsset {
  id: Id;
  type: "audio";
  storage_key: string;
  checksum: string;
  duration_ms: number;
}
export interface ImageAsset {
  id: Id;
  type: "image";
  storage_key: string;
  checksum: string;
  width: number;
  height: number;
}
export interface ImageBinding {
  asset_id: Id;
  element_id: Id;
  alt: string;
}
export interface Dialogue {
  /**
   * @minItems 1
   * @maxItems 3
   */
  messages: Id[];
  state: Id;
  /**
   * @maxItems 2
   */
  context_messages?: Id[];
}
export interface Process {
  /**
   * @minItems 2
   * @maxItems 4
   */
  stages: Id[];
  /**
   * @maxItems 2
   */
  details: Id[];
}
export interface Funnel {
  /**
   * @minItems 2
   * @maxItems 3
   */
  layers: Id[];
  /**
   * @minItems 1
   * @maxItems 3
   */
  notes: {
    element_id: Id;
    target?: Id;
    direction?: "up" | "down";
  }[];
}
export interface Element {
  id: Id;
  content: string;
  role?: "topic";
  concept_role?: "definition" | "feature" | "example" | "summary";
  icon?: "document" | "search" | "idea" | "code" | "check" | "warning";
  step?: number;
  highlight?: {
    text_start: number;
    text_end: number;
  };
  source_label?: string;
  panel_style?: "conclusion";
  event?: {
    lane_id: Id;
    start_ms: number;
    end_ms: number;
    phase: "execute" | "wait";
  };
  /**
   * @maxItems 6
   */
  items?: StateItem[];
  /**
   * @maxItems 6
   */
  active_item_ids?: Id[];
  /**
   * @minItems 1
   * @maxItems 16
   */
  code_lines?: number[];
  /**
   * @maxItems 3
   */
  variables?: {
    name: string;
    value: string;
  }[];
  /**
   * @maxItems 6
   */
  array_items?: (StateItem & {
    value?: string;
  })[];
  /**
   * @maxItems 2
   */
  pointers?: {
    name: string;
    item_id: Id;
  }[];
  loop?: null | {
    current: number;
    total: number;
  };
  input?: string;
  output?: string;
  entrance?: "fade_slide" | "draw" | "scale_pop" | "box" | "shake";
  cue: {
    text_start: number;
    text_end: number;
  };
}
export interface StateItem {
  id: Id;
  key: string;
  value: string;
}
