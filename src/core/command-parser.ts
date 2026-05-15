import type {
  EmmaCommand,
  ParsedResponse,
  AvatarExpression,
  AVATAR_EXPRESSIONS,
} from "@/types/emma";

const CMD_REGEX = /\[EMMA_CMD\](.*?)\[\/EMMA_CMD\]/gs;
const ROUTINE_REGEX = /\[EMMA_ROUTINE\](.*?)\[\/EMMA_ROUTINE\]/gs;
const EMOTION_REGEX = /\[emotion:\s*(\w+)\]/i;

const VALID_EXPRESSIONS = new Set<string>([
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
]);

/**
 * Parse EMMA response into clean text, device commands, routine trigger, and avatar expression.
 */
export function parseEmmaResponse(raw: string): ParsedResponse {
  const commands: EmmaCommand[] = [];
  let match: RegExpExecArray | null;

  // Extract device commands
  CMD_REGEX.lastIndex = 0;
  while ((match = CMD_REGEX.exec(raw)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as EmmaCommand;
      if (
        parsed.action &&
        parsed.room &&
        parsed.device &&
        parsed.property &&
        parsed.value !== undefined
      ) {
        commands.push(parsed);
      }
    } catch {
      console.warn("[EMMA] Malformed command block:", match[1]);
    }
  }

  // Extract routine trigger
  let routineId: string | undefined;
  ROUTINE_REGEX.lastIndex = 0;
  const routineMatch = ROUTINE_REGEX.exec(raw);
  if (routineMatch) {
    routineId = routineMatch[1].trim();
  }

  // Extract avatar expression
  let expression: AvatarExpression | undefined;
  const emotionMatch = EMOTION_REGEX.exec(raw);
  if (emotionMatch) {
    const candidate = emotionMatch[1].toLowerCase();
    if (VALID_EXPRESSIONS.has(candidate)) {
      expression = candidate as AvatarExpression;
    }
  }

  // Clean display text — remove all control tags
  const text = raw
    .replace(CMD_REGEX, "")
    .replace(ROUTINE_REGEX, "")
    .replace(EMOTION_REGEX, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, commands, routineId, expression };
}

export function formatCommandLog(cmd: EmmaCommand): string {
  return `${cmd.room}/${cmd.device} → ${cmd.property} = ${JSON.stringify(cmd.value)}`;
}
