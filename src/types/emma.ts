// ─── Device Graph Types (DEPRECATED — kept as inert stubs for type compat) ───
// Emma no longer controls physical devices. These types remain so old references
// compile, but no runtime code creates or consumes them.

export type DeviceProperty = string | number | boolean;

export interface DeviceState {
  label: string;
  icon: string;
  [key: string]: DeviceProperty;
}

export interface Room {
  label: string;
  icon: string;
  devices: Record<string, DeviceState>;
}

export type DeviceGraph = Record<string, Room>;

// Empty device graph — exported for any code still passing it around
export const EMPTY_DEVICE_GRAPH: DeviceGraph = {};

// ─── Avatar Types (L5 — Live2D) ──────────────────────────────────────────────

export type AvatarExpression =
  | "neutral"
  | "smirk"
  | "warm"
  | "concerned"
  | "amused"
  | "skeptical"
  | "listening"
  | "flirty"
  | "sad"
  | "idle_bored";

export const AVATAR_EXPRESSIONS: AvatarExpression[] = [
  "neutral",
  "smirk",
  "warm",
  "concerned",
  "amused",
  "skeptical",
  "listening",
  "flirty",
  "sad",
  "idle_bored",
];

export type AvatarLayout = "side" | "overlay" | "pip";

export interface AvatarState {
  loaded: boolean;
  expression: AvatarExpression;
  talking: boolean;
  layout: AvatarLayout;
  visible: boolean;
  idleSince: number;
}

// ─── Command Types ───────────────────────────────────────────────────────────

export interface EmmaCommand {
  action: "set";
  room: string;
  device: string;
  property: string;
  value: DeviceProperty;
}

export interface ParsedResponse {
  text: string;
  commands: EmmaCommand[];
  routineId?: string;
  expression?: AvatarExpression;
}

// ─── Chat Types ──────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  display: string;
  timestamp: number;
  commands?: EmmaCommand[];
  visionContext?: string;
  userId?: string;
  emotion?: EmotionState;
  expression?: AvatarExpression;
}

export interface ApiMessage {
  role: "user" | "assistant";
  content: string | ApiMessageContent[];
}

export interface ApiMessageContent {
  type: string;
  text?: string;
  source?:
    | { type: "base64"; media_type: string; data: string }
    | { type: "file"; file_id: string }
    | { type: "url"; url: string };
  // Extra fields for compaction/tool blocks passed through verbatim
  id?: string;
  name?: string;
  input?: unknown;
}

// ─── Voice Types ─────────────────────────────────────────────────────────────

export interface VoiceState {
  listening: boolean;
  supported: boolean;
  speaking: boolean;
}

// ─── Persona Types ───────────────────────────────────────────────────────────

export type PersonaId = "mommy" | "neutral";

export interface Persona {
  id: PersonaId;
  label: string;
  greeting: string;
  systemPrompt: string;
}

// ─── Vision Types (L2) ──────────────────────────────────────────────────────

export interface VisionFrame {
  id: string;
  timestamp: number;
  dataUrl: string;
  base64: string;
  mediaType: string;
}

export interface VisionAnalysis {
  id: string;
  timestamp: number;
  description: string;
  objects: string[];
  activities: string[];
  anomalies: string[];
}

export interface VisionApiRequest {
  frame: string;
  mediaType: string;
  context?: string;
  /** Cached Files API file_id — if provided, skips re-upload and uses this directly. */
  fileId?: string;
}

export interface VisionApiResponse {
  analysis: VisionAnalysis | null;
  error?: string;
  /** Files API file_id for the uploaded frame — cache and pass back on subsequent calls. */
  fileId?: string;
}

// ─── Memory Types (L2) ──────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  timestamp: number;
  category: MemoryCategory;
  key: string;
  value: string;
  confidence: number;
  source: "extracted" | "explicit" | "observed";
  lastAccessed?: number;
  userId?: string;
}

export type MemoryCategory = "preference" | "routine" | "personal" | "episodic" | "environment";

export interface MemoryStore {
  entries: MemoryEntry[];
  lastUpdated: number;
}

export interface MemoryApiRequest {
  action: "get" | "add" | "update" | "delete" | "extract";
  entry?: Partial<MemoryEntry>;
  conversationText?: string;
  category?: MemoryCategory;
}

export interface MemoryApiResponse {
  entries?: MemoryEntry[];
  extracted?: MemoryEntry[];
  error?: string;
}

// ─── Routine Types (L2+L3) ──────────────────────────────────────────────────

export interface Routine {
  id: string;
  name: string;
  icon: string;
  description: string;
  commands: EmmaCommand[];
  triggers?: RoutineTrigger[];
  builtIn: boolean;
  autonomyTier: AutonomyTier;
}

export interface RoutineTrigger {
  type: "time" | "voice" | "scene" | "manual";
  value: string;
}

// ─── ElevenLabs Types (L2) ──────────────────────────────────────────────────

export interface TtsRequest {
  text: string;
  voiceId?: string;
}
export interface TtsResponse {
  audioUrl?: string;
  error?: string;
}

// ─── Scheduler Types (L3) ───────────────────────────────────────────────────

export interface ScheduleEntry {
  id: string;
  routineId: string;
  time: string;
  days: DayOfWeek[];
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
}

export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const ALL_DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const WEEKDAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri"];
export const WEEKENDS: DayOfWeek[] = ["sat", "sun"];

// ─── Autonomy Types (L3) ────────────────────────────────────────────────────

export type AutonomyTier = 1 | 2 | 3;

// ─── Notification Types (L3) ────────────────────────────────────────────────

export interface ApprovalDetails {
  approvalId: string;
  taskId: string;
  tool: string;
  riskLevel: "dangerous";
  inputs: Record<string, string>;
  reason: string;
  expiresAt: number;
}

export interface AutonomousTask {
  id: string;
  goal: string;
  status:
    | "running"
    | "completed"
    | "failed"
    | "awaiting_approval"
    | "awaiting_suggestion"
    | "max_steps_reached";
  triggerType: "manual" | "scheduled" | "webhook";
  stepsTaken: number;
  totalTokens: number;
  createdAt: number;
  completedAt?: number;
  currentTool?: string;
}

export interface EmmaNotification {
  id: string;
  timestamp: number;
  type: NotificationType;
  title: string;
  message: string;
  tier: AutonomyTier;
  routineId?: string;
  actions?: NotificationAction[];
  dismissed: boolean;
  autoExpire?: number;
  approvalDetails?: ApprovalDetails;
}

export type NotificationType =
  | "auto_action"
  | "suggestion"
  | "alert"
  | "anomaly"
  | "system"
  | "emotion"
  | "approval";

export interface NotificationAction {
  label: string;
  action: "approve" | "dismiss" | "snooze" | "custom";
  value?: string;
}

// ─── Timeline Types (L3) ────────────────────────────────────────────────────

export interface TimelineEntry {
  id: string;
  timestamp: number;
  type: TimelineEventType;
  source: TimelineSource;
  title: string;
  detail: string;
  room?: string;
  device?: string;
  routineId?: string;
  tier?: AutonomyTier;
  userId?: string;
}

export type TimelineEventType =
  | "device_command"
  | "routine_executed"
  | "schedule_triggered"
  | "memory_extracted"
  | "vision_analysis"
  | "notification_sent"
  | "user_message"
  | "system_event"
  | "emotion_detected"
  | "user_switched"
  | "routine_run"
  | "workflow_triggered";

export type TimelineSource = "user" | "scheduler" | "proactive" | "system";

// ─── Multi-User Types (L4) ──────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  name: string;
  avatar: string; // Emoji avatar
  color: string; // Accent color hex
  role: "admin" | "member" | "guest";
  preferences: UserPreferences;
  autonomyOverrides?: Partial<Record<string, AutonomyTier>>;
  voiceId?: string; // For voice fingerprinting (future)
  createdAt: number;
}

export interface UserPreferences {
  preferredTemp: number;
  lightBrightness: number;
  lightColor: string;
  ttsEnabled: boolean;
  notificationsEnabled: boolean;
  quietHoursStart?: string; // "HH:mm"
  quietHoursEnd?: string;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  preferredTemp: 72,
  lightBrightness: 70,
  lightColor: "warm white",
  ttsEnabled: true,
  notificationsEnabled: true,
};

// ─── Emotion Types (L4) ─────────────────────────────────────────────────────

export interface EmotionState {
  primary: EmotionLabel;
  confidence: number; // 0-1
  valence: number; // -1 (negative) to 1 (positive)
  arousal: number; // 0 (calm) to 1 (excited)
  source: "voice" | "vision" | "text" | "combined";
  timestamp: number;
}

export type EmotionLabel =
  | "neutral"
  | "happy"
  | "sad"
  | "angry"
  | "anxious"
  | "tired"
  | "excited"
  | "frustrated"
  | "calm"
  | "stressed";

export interface EmotionAnalysis {
  voiceSentiment?: { label: EmotionLabel; confidence: number };
  facialExpression?: { label: EmotionLabel; confidence: number };
  textSentiment?: { label: EmotionLabel; confidence: number };
  combined: EmotionState;
}

// ─── Dashboard Types (L4) ───────────────────────────────────────────────────

export interface PillarStatus {
  id: string;
  name: string;
  icon: string;
  status: "online" | "degraded" | "offline";
  detail: string;
  metrics: Record<string, string | number>;
}

// ─── Action Log (compat) ────────────────────────────────────────────────────

export interface ActionLogEntry {
  id: string;
  timestamp: number;
  time: string;
  text: string;
  room: string;
  device: string;
}

// ─── API Types ───────────────────────────────────────────────────────────────

export interface AttachedFile {
  file_id: string;
  media_type: string;
  name: string;
}

export interface UserLocation {
  city?: string;
  country?: string;
  timezone?: string;
}

/** A single result in a RequestSearchResultBlock — for RAG / custom knowledge base retrieval. */
export interface SearchResult {
  /** URL of the source document. */
  source: string;
  title?: string;
  /** The retrieved text content for this result. */
  content: string;
}

export interface CitationBlock {
  type: "char_location" | "page_location" | "content_block_location" | "web_search_result_location";
  cited_text: string;
  document_index?: number;
  document_title?: string | null;
  /** Present on web_search_result_location citations. */
  url?: string;
  title?: string | null;
  start_char_index?: number;
  end_char_index?: number;
  start_page_number?: number;
  end_page_number?: number;
  start_block_index?: number;
  end_block_index?: number;
}

export interface EmmaApiRequest {
  messages: ApiMessage[];
  deviceGraph: DeviceGraph;
  memories?: MemoryEntry[];
  visionContext?: string;
  persona?: string;
  activeUser?: UserProfile;
  emotionState?: EmotionState;
  /** Files already uploaded via the Files API to attach to this turn. */
  attachedFiles?: AttachedFile[];
  /** Direct PDF (or other document) URLs to attach as document blocks this turn. */
  pdfUrls?: string[];
  /** User's approximate location for web search result localization. */
  userLocation?: UserLocation;
  /** RAG results to pass as a search_results content block for native citation support. */
  searchResults?: SearchResult[];
  /**
   * Document generation skills to enable: "pptx" | "xlsx" | "docx" | "pdf".
   * When set, the code_execution tool and a skills container are
   * included in the request so Emma can produce real downloadable files.
   */
  skills?: string[];
  /**
   * Enable programmatic tool calling via code_execution_20260120.
   * Emma can write Python that calls multiple integration tools in one pass.
   * Requires skills to be enabled. Incompatible with strict: true on tools.
   */
  programmaticTools?: boolean;
  /**
   * Message ID returned by the previous response. When provided, the API
   * returns cache diagnostics so the server can log where the prefix diverged.
   */
  lastResponseId?: string;
  /** IANA timezone string for usage window boundary calculations (e.g. "America/New_York"). */
  userTimezone?: string;
  /** Day of month (1-31) the billing cycle resets on. Defaults to 1. */
  billingAnchorDay?: number;
}

export interface GeneratedFile {
  file_id: string;
  name?: string;
}

export interface EmmaApiResponse {
  text: string;
  raw: string;
  commands: EmmaCommand[];
  routineId?: string;
  expression?: AvatarExpression;
  memoryExtracts?: Partial<MemoryEntry>[];
  error?: string;
  /** Upstream HTTP status code — present on error responses only. */
  status?: number;
  /** Machine-readable error code for programmatic handling. */
  code?: "BAD_REQUEST" | "AUTH_ERROR" | "RATE_LIMIT" | "OVERLOADED" | "TIMEOUT" | "UPSTREAM_ERROR";
}
