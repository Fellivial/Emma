import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local into a temporary object — do NOT spread it into process.env.
// Spreading would inject NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY,
// causing unit tests that rely on the in-memory fallback path to hit real Supabase.
const parsed = config({ path: resolve(process.cwd(), ".env.local"), processEnv: {} });

// Only forward the API key(s) that integration/E2E tests actually need.
// Everything else stays absent so unit-test mocks control the relevant paths.
if (parsed.parsed?.OPENROUTER_API_KEY && !process.env.OPENROUTER_API_KEY) {
  process.env.OPENROUTER_API_KEY = parsed.parsed.OPENROUTER_API_KEY;
}
