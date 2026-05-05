export interface PricingPlan {
  id: string;
  label: string;
  price: string;
  suffix?: string;
  description: string;
  features: string[];
  featured?: boolean;
  cta: string;
  ctaHref: string;
}

export interface FAQ {
  question: string;
  answer: string;
}

export interface StatItem {
  value: string;
  label: string;
  sublabel?: string;
}

export interface ProblemCard {
  id: string;
  headline: string;
  body: string;
  tag: string;
}

export interface CapabilityCard {
  id: string;
  icon: string;
  title: string;
  description: string;
}

export interface TickerItem {
  text: string;
  accent?: boolean;
}

export interface ApproachStep {
  number: string;
  title: string;
  body: string;
  detail: string;
}

export interface TerminalLine {
  text: string;
  type: "command" | "info" | "success" | "output" | "blank";
}
