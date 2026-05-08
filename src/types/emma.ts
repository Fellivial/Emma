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
  | "neutral" | "smirk" | "warm" | "concerned" | "amused"
  | "skeptical" | "listening" | "flirty" | "sad" | "idle_bored";

export const AVATAR_EXPRESSIONS: AvatarExpression[] = [
  "neutral", "smirk", "warm", "concerned", "amused",
  "skeptical", "listening", "flirty", "sad", "idle_bored",
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
  type: "text" | "image";
  text?: string;
  source?: { type: "base64"; media_type: string; data: string };
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
}

export interface VisionApiResponse {
  analysis: VisionAnalysis | null;
  error?: string;
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

export type MemoryCategory =
  | "preference" | "routine" | "personal" | "episodic" | "environment";

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

export interface TtsRequest { text: string; voiceId?: string }
export interface TtsResponse { audioUrl?: string; error?: string }

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
  status: "running" | "completed" | "failed" | "awaiting_approval" | "awaiting_suggestion" | "max_steps_reached";
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
  | "auto_action" | "suggestion" | "alert" | "anomaly" | "system" | "emotion" | "approval";

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
  | "device_command" | "routine_executed" | "schedule_triggered"
  | "memory_extracted" | "vision_analysis" | "notification_sent"
  | "user_message" | "system_event" | "emotion_detected"
  | "user_switched" | "routine_run" | "workflow_triggered";

export type TimelineSource = "user" | "scheduler" | "proactive" | "system";

// ─── Multi-User Types (L4) ──────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;          // Emoji avatar
  color: string;           // Accent color hex
  role: "admin" | "member" | "guest";
  preferences: UserPreferences;
  autonomyOverrides?: Partial<Record<string, AutonomyTier>>;
  voiceId?: string;        // For voice fingerprinting (future)
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
  confidence: number;       // 0-1
  valence: number;          // -1 (negative) to 1 (positive)
  arousal: number;          // 0 (calm) to 1 (excited)
  source: "voice" | "vision" | "text" | "combined";
  timestamp: number;
}

export type EmotionLabel =
  | "neutral" | "happy" | "sad" | "angry" | "anxious"
  | "tired" | "excited" | "frustrated" | "calm" | "stressed";

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

export interface EmmaApiRequest {
  messages: ApiMessage[];
  deviceGraph: DeviceGraph;
  memories?: MemoryEntry[];
  visionContext?: string;
  persona?: string;
  activeUser?: UserProfile;
  emotionState?: EmotionState;
}

export interface EmmaApiResponse {
  text: string;
  raw: string;
  commands: EmmaCommand[];
  routineId?: string;
  expression?: AvatarExpression;
  memoryExtracts?: Partial<MemoryEntry>[];
  error?: string;
}
