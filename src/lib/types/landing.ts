export interface NavLink {
  label: string;
  href: string;
}

export interface ProblemCard {
  tag: string;
  num: string;
  title: string;
  body: string;
}

export interface Capability {
  num: string;
  title: string;
  body: string;
}

export interface StatItem {
  label: string;
  value: string;
  sub: string;
  numeric?: number;
}

export interface TerminalLine {
  text: string;
}

export interface PricingFeature {
  text: string;
}

export interface PricingPlan {
  name: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  featured?: boolean;
  ctaHref: string;
}

export interface FAQ {
  n: string;
  question: string;
  answer: string;
}

export interface BarEntry {
  label: string;
  pct: number;
  isEmma?: boolean;
  display?: string;
}

export interface PanelData {
  title: string;
  bars: BarEntry[];
}

export interface ApproachStep {
  label: string;
  title: string;
  panelKey: "coverage" | "latency" | "memory";
}

export interface FeatureStrip {
  tag: string;
  title: string;
  body: string;
}
