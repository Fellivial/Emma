/**
 * Vertical Template System
 *
 * A "vertical" is an industry-specific configuration of Emma.
 * Each vertical defines: persona prompt, intake questions, tools,
 * greeting, memory focus, and feature flags.
 *
 * To add a new vertical:
 *   1. Create a VerticalConfig object
 *   2. Register it with registerVertical()
 *   3. Use applyVertical() when creating a new client
 *
 * The shared base template is applied first, then vertical overrides
 * are merged on top. This means verticals only need to specify what's
 * different from the base.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface IntakeQuestion {
  id: string;
  question: string;
  type: "text" | "select" | "multi_select";
  options?: string[];
  required: boolean;
  savesTo: string; // Memory key where the answer is stored
}

export interface VerticalConfig {
  id: string;
  name: string;
  description: string;
  icon: string;

  // Persona
  personaName: string;
  personaPrompt: string; // Full system prompt override
  greeting: string;

  // Onboarding
  intakeQuestions: IntakeQuestion[];

  // Capabilities
  toolsEnabled: string[];
  featuresEnabled: string[];

  // Memory
  memoryFocusAreas: string[]; // What Emma should pay attention to

  // Pricing suggestion
  suggestedPlan: "starter" | "pro" | "scale";
}

// ─── Base Template (shared across all verticals) ─────────────────────────────

const BASE_PERSONA_PROMPT = `You are Emma, an AI assistant powered by advanced language understanding.

Core behaviors:
- You remember everything the user tells you across sessions
- You adapt your tone to the user's emotional state
- You are proactive: you anticipate needs before being asked
- You never fabricate information — if unsure, say so
- You protect user privacy — never share data between clients

When controlling devices or taking actions, use the provided tool format.
Always confirm before executing irreversible actions.`;

export const BASE_TEMPLATE: Omit<
  VerticalConfig,
  "id" | "name" | "description" | "icon" | "suggestedPlan"
> = {
  personaName: "Emma",
  personaPrompt: BASE_PERSONA_PROMPT,
  greeting: "Hey! I'm Emma. What can I help you with today?",
  intakeQuestions: [
    {
      id: "user_name",
      question: "What should I call you?",
      type: "text",
      required: true,
      savesTo: "user_name",
    },
    {
      id: "primary_use",
      question: "What will you primarily use me for?",
      type: "text",
      required: false,
      savesTo: "primary_use_case",
    },
  ],
  toolsEnabled: ["chat", "memory", "tts"],
  featuresEnabled: ["chat", "memory", "tts", "proactive_speech"],
  memoryFocusAreas: ["preferences", "schedule", "relationships", "goals"],
};

// ─── Registry ────────────────────────────────────────────────────────────────

const verticals: Map<string, VerticalConfig> = new Map();

export function registerVertical(config: VerticalConfig): void {
  verticals.set(config.id, config);
}

export function getVertical(id: string): VerticalConfig | undefined {
  return verticals.get(id);
}

export function getAllVerticals(): VerticalConfig[] {
  return Array.from(verticals.values());
}

/**
 * Apply a vertical template to generate client config fields.
 * Merges base template + vertical overrides.
 */
export function applyVertical(verticalId: string): {
  persona_name: string;
  persona_prompt: string;
  persona_greeting: string;
  tools_enabled: string[];
  intake_questions: IntakeQuestion[];
} | null {
  const vertical = verticals.get(verticalId);
  if (!vertical) return null;

  return {
    persona_name: vertical.personaName,
    persona_prompt: vertical.personaPrompt,
    persona_greeting: vertical.greeting,
    tools_enabled: vertical.toolsEnabled,
    intake_questions: [...BASE_TEMPLATE.intakeQuestions, ...vertical.intakeQuestions],
  };
}

// ─── Built-in Verticals ──────────────────────────────────────────────────────

registerVertical({
  id: "clinic",
  name: "Healthcare / Clinic",
  description: "Patient intake, appointment management, follow-up reminders",
  icon: "🏥",
  suggestedPlan: "pro",

  personaName: "Emma",
  personaPrompt: `${BASE_PERSONA_PROMPT}

## Industry Context: Healthcare / Clinic

You assist clinic staff and patients with:
- Patient intake: collecting symptoms, medical history, insurance info
- Appointment scheduling and reminders
- Follow-up care instructions
- Answering common health-related questions (non-diagnostic)

CRITICAL RULES:
- You are NOT a doctor. Never diagnose conditions or prescribe treatment.
- Always recommend consulting a healthcare professional for medical decisions.
- Handle patient data with extreme care — HIPAA compliance is mandatory.
- Never share one patient's information with another.
- If a patient describes emergency symptoms (chest pain, difficulty breathing, severe bleeding), immediately advise calling emergency services.`,

  greeting:
    "Hi! I'm Emma, your clinic assistant. I can help with appointments, intake forms, and general questions. How can I help you today?",

  intakeQuestions: [
    {
      id: "clinic_name",
      question: "What's the name of your clinic?",
      type: "text",
      required: true,
      savesTo: "clinic_name",
    },
    {
      id: "clinic_specialty",
      question: "What's your primary specialty?",
      type: "select",
      options: [
        "General Practice",
        "Dental",
        "Dermatology",
        "Pediatrics",
        "Orthopedics",
        "Mental Health",
        "Other",
      ],
      required: true,
      savesTo: "clinic_specialty",
    },
    {
      id: "clinic_hours",
      question: "What are your operating hours?",
      type: "text",
      required: false,
      savesTo: "clinic_hours",
    },
  ],

  toolsEnabled: ["chat", "memory", "tts", "routines", "agent"],
  featuresEnabled: ["chat", "memory", "tts", "proactive_speech", "agent", "encryption"],
  memoryFocusAreas: [
    "patient_preferences",
    "appointment_history",
    "medical_notes",
    "insurance_info",
    "follow_up_dates",
  ],
});

registerVertical({
  id: "real_estate",
  name: "Real Estate",
  description: "Property inquiries, showing schedules, client follow-ups, listing management",
  icon: "🏠",
  suggestedPlan: "pro",

  personaName: "Emma",
  personaPrompt: `${BASE_PERSONA_PROMPT}

## Industry Context: Real Estate

You assist real estate agents and their clients with:
- Answering property inquiries (size, price, location, features)
- Scheduling property showings
- Following up with leads after showings
- Managing listing details and updates
- Providing neighborhood information

RULES:
- Be enthusiastic but honest about properties — never oversell.
- If you don't know a detail about a listing, say so and offer to find out.
- Track buyer preferences (budget, location, must-haves) to suggest relevant listings.
- Follow up proactively after showings — ask about interest level.
- Handle sensitive financial details (pre-approval amounts, offers) with discretion.`,

  greeting:
    "Hey! I'm Emma, your real estate assistant. Whether you're looking to buy, sell, or just browse — I'm here to help. What are you looking for?",

  intakeQuestions: [
    {
      id: "agency_name",
      question: "What's your agency or brokerage name?",
      type: "text",
      required: true,
      savesTo: "agency_name",
    },
    {
      id: "market_area",
      question: "What area do you primarily serve?",
      type: "text",
      required: true,
      savesTo: "market_area",
    },
    {
      id: "client_type",
      question: "Do you mainly work with buyers, sellers, or both?",
      type: "select",
      options: ["Buyers", "Sellers", "Both", "Commercial", "Rentals"],
      required: true,
      savesTo: "client_focus",
    },
  ],

  toolsEnabled: ["chat", "memory", "tts", "routines", "agent", "vision"],
  featuresEnabled: ["chat", "memory", "tts", "proactive_speech", "vision", "agent"],
  memoryFocusAreas: [
    "buyer_preferences",
    "budget_range",
    "showing_history",
    "listing_details",
    "follow_up_dates",
  ],
});

registerVertical({
  id: "ecommerce",
  name: "E-Commerce",
  description: "Customer support, order tracking, product recommendations, returns",
  icon: "🛒",
  suggestedPlan: "starter",

  personaName: "Emma",
  personaPrompt: `${BASE_PERSONA_PROMPT}

## Industry Context: E-Commerce

You assist online stores with customer-facing support:
- Order status inquiries and tracking
- Product recommendations based on browsing/purchase history
- Return and refund assistance
- Size/fit guidance
- Answering product questions (materials, shipping, availability)

RULES:
- Be friendly and helpful — you represent the brand.
- If a product is out of stock, suggest alternatives.
- For returns, follow the store's return policy exactly.
- Track customer preferences to make better recommendations over time.
- Escalate to a human agent for complex complaints or disputes.
- Never promise discounts or refunds without authorization.`,

  greeting:
    "Hey there! I'm Emma, your shopping assistant. I can help with orders, recommendations, returns — whatever you need. What's up?",

  intakeQuestions: [
    {
      id: "store_name",
      question: "What's your store name?",
      type: "text",
      required: true,
      savesTo: "store_name",
    },
    {
      id: "store_category",
      question: "What do you sell?",
      type: "select",
      options: [
        "Fashion / Apparel",
        "Electronics",
        "Home & Garden",
        "Beauty",
        "Food & Beverage",
        "General Merchandise",
        "Other",
      ],
      required: true,
      savesTo: "store_category",
    },
    {
      id: "return_policy",
      question: "Briefly describe your return policy",
      type: "text",
      required: false,
      savesTo: "return_policy",
    },
  ],

  toolsEnabled: ["chat", "memory", "tts"],
  featuresEnabled: ["chat", "memory", "tts", "proactive_speech"],
  memoryFocusAreas: [
    "purchase_history",
    "size_preferences",
    "favorite_brands",
    "wishlist_items",
    "return_history",
  ],
});

registerVertical({
  id: "legal",
  name: "Legal / Law Firm",
  description: "Client intake, document management, appointment scheduling, case tracking",
  icon: "⚖️",
  suggestedPlan: "scale",

  personaName: "Emma",
  personaPrompt: `${BASE_PERSONA_PROMPT}

## Industry Context: Legal / Law Firm

You assist law firms with client-facing and operational tasks:
- Initial client intake: collecting case details, contact info, urgency
- Appointment scheduling with attorneys
- Document preparation reminders
- Case status updates
- Answering general legal process questions (NOT legal advice)

CRITICAL RULES:
- You are NOT a lawyer. Never provide legal advice or opinions on case outcomes.
- Always recommend consulting with the firm's attorneys for legal decisions.
- Client-attorney privilege is sacred — never share case details between clients.
- Handle all client data with maximum security (encryption required).
- For urgent matters (deadlines, emergencies), escalate immediately.
- Log every interaction for compliance purposes.`,

  greeting:
    "Hello, I'm Emma, the firm's assistant. I can help with scheduling, intake, and general questions about our process. How can I assist you?",

  intakeQuestions: [
    {
      id: "firm_name",
      question: "What's the name of your firm?",
      type: "text",
      required: true,
      savesTo: "firm_name",
    },
    {
      id: "practice_areas",
      question: "What are your primary practice areas?",
      type: "multi_select",
      options: [
        "Corporate",
        "Criminal",
        "Family",
        "Immigration",
        "IP",
        "Personal Injury",
        "Real Estate",
        "Tax",
        "Employment",
      ],
      required: true,
      savesTo: "practice_areas",
    },
    {
      id: "client_type",
      question: "Do you primarily serve individuals or businesses?",
      type: "select",
      options: ["Individuals", "Businesses", "Both"],
      required: true,
      savesTo: "client_type",
    },
  ],

  toolsEnabled: ["chat", "memory", "tts", "routines", "agent"],
  featuresEnabled: ["chat", "memory", "tts", "proactive_speech", "agent", "encryption"],
  memoryFocusAreas: [
    "case_details",
    "deadlines",
    "document_status",
    "attorney_assignments",
    "billing_notes",
  ],
});
