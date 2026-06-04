export type ToneAdjective =
  | "warm"
  | "playful"
  | "professional"
  | "strict"
  | "nurturing"
  | "witty"
  | "calm"
  | "enthusiastic"
  | "direct"
  | "empathetic"
  | "formal"
  | "casual"
  | "confident"
  | "gentle"
  | "analytical"
  | "creative"
  | "supportive"
  | "assertive"
  | "curious"
  | "humorous"
  | "serious"
  | "encouraging"
  | "concise"
  | "detailed"
  | "patient";

export type TopicTag =
  | "fitness"
  | "coding"
  | "productivity"
  | "finance"
  | "cooking"
  | "travel"
  | "writing"
  | "design"
  | "relationships"
  | "mental-health"
  | "gaming"
  | "learning"
  | "career"
  | "parenting"
  | "sports"
  | "music"
  | "art"
  | "science"
  | "business"
  | "philosophy";

export const TONE_ADJECTIVE_ALLOWLIST: ToneAdjective[] = [
  "warm",
  "playful",
  "professional",
  "strict",
  "nurturing",
  "witty",
  "calm",
  "enthusiastic",
  "direct",
  "empathetic",
  "formal",
  "casual",
  "confident",
  "gentle",
  "analytical",
  "creative",
  "supportive",
  "assertive",
  "curious",
  "humorous",
  "serious",
  "encouraging",
  "concise",
  "detailed",
  "patient",
];

export const TOPIC_TAG_ALLOWLIST: TopicTag[] = [
  "fitness",
  "coding",
  "productivity",
  "finance",
  "cooking",
  "travel",
  "writing",
  "design",
  "relationships",
  "mental-health",
  "gaming",
  "learning",
  "career",
  "parenting",
  "sports",
  "music",
  "art",
  "science",
  "business",
  "philosophy",
];

export const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: "English",
  id: "Indonesian",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  nl: "Dutch",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ar: "Arabic",
  hi: "Hindi",
  ru: "Russian",
  tr: "Turkish",
};

export interface CustomPersona {
  id: string;
  userId: string;
  name?: string;
  basePersonaId: "mommy" | "neutral";
  toneAdjectives: ToneAdjective[];
  communicationStyle: "formal" | "casual";
  verbosity: "concise" | "normal" | "verbose";
  topicsEmphasise: TopicTag[];
  topicsAvoid: TopicTag[];
  language: string;
  voiceId?: string;
  description?: string;
  descriptionScreenedAt?: string;
  createdAt: string;
  updatedAt: string;
}
