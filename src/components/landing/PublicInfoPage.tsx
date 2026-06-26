import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import Footer from "@/components/landing/Footer";

export interface PublicInfoSection {
  title: string;
  body: ReactNode;
  items?: string[];
}

interface PublicInfoPageProps {
  eyebrow: string;
  title: string;
  intro: string;
  sections: PublicInfoSection[];
}

const landingVars = {
  background: "var(--l-bg)",
  color: "var(--l-text)",
  "--font-l-display": "var(--font-cormorant), Georgia, serif",
  "--font-l-cond": "var(--font-outfit), system-ui, sans-serif",
  "--font-l-body": "var(--font-outfit), system-ui, sans-serif",
  "--font-l-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
} as CSSProperties;

export default function PublicInfoPage({ eyebrow, title, intro, sections }: PublicInfoPageProps) {
  return (
    <div style={landingVars}>
      <main style={{ minHeight: "100vh", background: "var(--l-bg)" }}>
        <nav
          style={{
            borderBottom: "1px solid var(--l-border)",
            padding: "18px 40px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "24px",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/landing"
            style={{
              fontFamily: "var(--font-l-display)",
              fontSize: "22px",
              color: "var(--l-text)",
              textDecoration: "none",
              letterSpacing: "0.04em",
            }}
          >
            EM<span style={{ color: "var(--l-accent)" }}>M</span>A
          </Link>
          <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
            {[
              ["Privacy", "/privacy"],
              ["Terms", "/terms"],
              ["Support", "/support"],
              ["Beta", "/beta"],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                style={{
                  color: "var(--l-muted)",
                  fontFamily: "var(--font-l-body)",
                  fontSize: "13px",
                  textDecoration: "none",
                }}
              >
                {label}
              </Link>
            ))}
          </div>
        </nav>

        <section style={{ padding: "72px 40px 44px" }}>
          <div style={{ maxWidth: "920px", margin: "0 auto" }}>
            <p
              style={{
                color: "var(--l-accent)",
                fontFamily: "var(--font-l-mono)",
                fontSize: "11px",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                marginBottom: "16px",
              }}
            >
              {eyebrow}
            </p>
            <h1
              style={{
                color: "var(--l-text)",
                fontFamily: "var(--font-l-display)",
                fontSize: "clamp(40px, 7vw, 76px)",
                fontWeight: 600,
                lineHeight: 0.98,
                marginBottom: "24px",
              }}
            >
              {title}
            </h1>
            <p
              style={{
                color: "var(--l-muted)",
                fontFamily: "var(--font-l-body)",
                fontSize: "17px",
                lineHeight: 1.7,
                maxWidth: "720px",
              }}
            >
              {intro}
            </p>
          </div>
        </section>

        <section style={{ padding: "0 40px 80px" }}>
          <div
            style={{
              maxWidth: "920px",
              margin: "0 auto",
              borderTop: "1px solid var(--l-border)",
            }}
          >
            {sections.map((section) => (
              <article
                key={section.title}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(180px, 0.34fr) minmax(0, 1fr)",
                  gap: "32px",
                  borderBottom: "1px solid var(--l-border)",
                  padding: "34px 0",
                }}
                className="grid-cols-1 md:grid-cols-[minmax(180px,0.34fr)_minmax(0,1fr)]"
              >
                <h2
                  style={{
                    color: "var(--l-text)",
                    fontFamily: "var(--font-l-body)",
                    fontSize: "15px",
                    fontWeight: 600,
                    lineHeight: 1.35,
                  }}
                >
                  {section.title}
                </h2>
                <div>
                  <p
                    style={{
                      color: "var(--l-muted)",
                      fontFamily: "var(--font-l-body)",
                      fontSize: "15px",
                      lineHeight: 1.75,
                    }}
                  >
                    {section.body}
                  </p>
                  {section.items && (
                    <ul
                      style={{
                        listStyle: "none",
                        display: "grid",
                        gap: "10px",
                        marginTop: "18px",
                      }}
                    >
                      {section.items.map((item) => (
                        <li
                          key={item}
                          style={{
                            color: "var(--l-muted)",
                            fontFamily: "var(--font-l-body)",
                            fontSize: "14px",
                            lineHeight: 1.6,
                            paddingLeft: "18px",
                            borderLeft: "2px solid var(--l-accent)",
                          }}
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
