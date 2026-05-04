"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

const PLANS = [
  {
    id: "free",
    label: "FREE",
    price: "Free",
    tokens: "300K tokens",
    msgLimit: "10 msgs/day · 50/week",
    features: ["Chat with Emma", "Voice TTS / STT (Web Speech)", "10 msgs/day · 50/week"],
    featured: false,
    cta: "Get Started",
  },
  {
    id: "starter",
    label: "STARTER",
    price: "$29",
    suffix: "/mo",
    tokens: "1M tokens",
    features: [
      "Persistent memory + extraction",
      "Screen & camera vision",
      "Emotion detection & adaptation",
      "Routines & schedules",
      "40 msgs/day · 200/week",
    ],
    featured: false,
    cta: "Subscribe",
  },
  {
    id: "pro",
    label: "PRO",
    price: "$79",
    suffix: "/mo",
    tokens: "2M tokens",
    features: [
      "ElevenLabs TTS (high quality voice)",
      "Custom persona configuration",
      "API access for integrations",
      "Multi-user profiles (up to 10)",
      "80 msgs/day · 400/week",
      "Priority support",
    ],
    featured: true,
    popular: true,
    cta: "Get Pro",
  },
  {
    id: "enterprise",
    label: "ENTERPRISE",
    price: "Contact",
    tokens: "Unlimited tokens",
    features: [
      "ElevenLabs dedicated TTS",
      "Fully autonomous agent tier",
      "99.9% SLA + white-label option",
      "Dedicated account management",
    ],
    featured: false,
    cta: "Contact Sales",
  },
];

const PILLARS = [
  {
    numeral: "I",
    name: "Voice",
    desc: "Real-time speech, expression-aware tone. She hears you and speaks back.",
  },
  {
    numeral: "II",
    name: "Vision",
    desc: "Webcam and screen context. She sees what you're working on.",
  },
  {
    numeral: "III",
    name: "Brain",
    desc: "Workflow orchestration, routine execution. The conductor of your workspace.",
  },
  {
    numeral: "IV",
    name: "Personality",
    desc: "Persistent memory, emotion detection. She adapts to who you are over time.",
  },
  {
    numeral: "V",
    name: "Proactive",
    desc: "Pattern-aware, time-triggered, autonomous. She acts before you ask.",
  },
];

// ── GLSL shaders — 5 sections (0-4) ─────────────────────────────────────────

const VERTEX_SHADER = `
  attribute vec3 aBasePos;
  attribute float aPhase;
  attribute float aSize;

  uniform float uTime;
  uniform float uSection;
  uniform vec2  uMouse;

  void main() {
    vec3 pos = aBasePos;

    // Slow breathing drift — each particle has its own phase
    pos.y += sin(uTime * 0.22 + aPhase) * 0.18;
    pos.x += cos(uTime * 0.17 + aPhase * 1.4) * 0.12;
    pos.z += sin(uTime * 0.11 + aPhase * 0.8) * 0.09;

    // Section 0 → 1: rise and dissolve upward (hero → manifesto)
    float s01 = clamp(uSection, 0.0, 1.0);
    pos.y += s01 * (2.5 + fract(aPhase) * 2.5);

    // Section 1 → 2: horizontal banding (manifesto → pillars)
    float s12 = clamp(uSection - 1.0, 0.0, 1.0);
    float bandIdx = floor(aPhase / (6.2831 / 5.0));
    float bandY   = (bandIdx - 2.0) * 1.4;
    pos.y = mix(pos.y, bandY, s12 * 0.65);
    pos.x = mix(pos.x, aBasePos.x * 1.8, s12 * 0.25);

    // Section 2 → 3: flatten into plane (pillars → pricing)
    float s23 = clamp(uSection - 2.0, 0.0, 1.0);
    pos.z = mix(pos.z, aBasePos.z * 0.18, s23 * 0.55);
    pos.y = mix(pos.y, aBasePos.y * 0.45, s23 * 0.35);
    pos.x = mix(pos.x, aBasePos.x * 1.2, s23 * 0.2);

    // Section 3 → 4: converge toward center (pricing → waitlist)
    float s34 = clamp(uSection - 3.0, 0.0, 1.0);
    pos = mix(pos, vec3(0.0, 0.0, aBasePos.z * 0.15), s34 * 0.8);

    // Mouse repulsion — hero only, fades with section
    float heroW = 1.0 - smoothstep(0.0, 0.9, uSection);
    vec2  toMouse = pos.xy - uMouse * 5.5;
    float d   = length(toMouse);
    float rep = heroW * smoothstep(2.2, 0.1, d) * 0.9;
    pos.xy += normalize(toMouse + vec2(0.0001)) * rep;

    vec4 mvPos    = modelViewMatrix * vec4(pos, 1.0);
    gl_Position   = projectionMatrix * mvPos;
    gl_PointSize  = aSize * (160.0 / -mvPos.z);
  }
`;

const FRAGMENT_SHADER = `
  uniform float uOpacity;

  void main() {
    vec2  uv = gl_PointCoord - 0.5;
    float r  = length(uv) * 2.0;
    if (r > 1.0) discard;
    float alpha = (1.0 - r) * (1.0 - r) * uOpacity;
    gl_FragColor = vec4(0.91, 0.70, 0.82, alpha);
  }
`;

// ── Component ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const heroGlyphRef    = useRef<HTMLDivElement>(null);
  const avatarFrameRef  = useRef<HTMLDivElement>(null);
  const pillarRefs      = useRef<(HTMLLIElement | null)[]>([]);

  const [email, setEmail]             = useState("");
  const [submitted, setSubmitted]     = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [currentSection, setCurrentSection] = useState(0);
  const [navFrosted, setNavFrosted]   = useState(false);
  const [hoveredPillar, setHoveredPillar] = useState<number | null>(null);
  const [pillarVisible, setPillarVisible] = useState<boolean[]>([false, false, false, false, false]);
  const [showSignIn, setShowSignIn]   = useState(false);

  const smoothSectionRef  = useRef(0);
  const targetSectionRef  = useRef(0);
  const mouseRef          = useRef({ nx: 0, ny: 0 });

  // Allow scrolling on the landing page (globals.css sets overflow:hidden for the app)
  useEffect(() => {
    document.body.style.overflow = "auto";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const TOTAL_SECTIONS = 5;

  // ── Three.js scene ───────────────────────────────────────────────────────
  useEffect(() => {
    let disposed = false;
    let animId   = 0;

    const run = async () => {
      if (!canvasRef.current) return;
      const THREE = await import("three");
      if (disposed || !canvasRef.current) return;

      const canvas   = canvasRef.current;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(innerWidth, innerHeight);
      renderer.setClearColor(0x000000, 0);

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
      camera.position.z = 8;

      // — Particles —
      const COUNT  = 2600;
      const basePos = new Float32Array(COUNT * 3);
      const phases  = new Float32Array(COUNT);
      const sizes   = new Float32Array(COUNT);

      for (let i = 0; i < COUNT; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const r     = 2.5 + Math.random() * 2.5;
        const disk  = 0.45 + Math.random() * 0.55;
        basePos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        basePos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * disk;
        basePos[i * 3 + 2] = r * Math.cos(phi) * 0.55;
        phases[i] = Math.random() * Math.PI * 2;
        sizes[i]  = 0.3 + Math.random() * 0.9;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(basePos.slice(), 3));
      geo.setAttribute("aBasePos", new THREE.BufferAttribute(basePos, 3));
      geo.setAttribute("aPhase",   new THREE.BufferAttribute(phases, 1));
      geo.setAttribute("aSize",    new THREE.BufferAttribute(sizes, 1));

      const particleMat = new THREE.ShaderMaterial({
        vertexShader:   VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          uTime:    { value: 0 },
          uSection: { value: 0 },
          uMouse:   { value: new THREE.Vector2(0, 0) },
          uOpacity: { value: 0.38 },
        },
        blending:    THREE.AdditiveBlending,
        depthWrite:  false,
        transparent: true,
      });

      const points = new THREE.Points(geo, particleMat);
      scene.add(points);

      // — Torus rings (peak at manifesto, §01) —
      const torusMat1 = new THREE.MeshBasicMaterial({
        color: 0xe8a0bf, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending,
      });
      const torusMat2 = new THREE.MeshBasicMaterial({
        color: 0xc77dba, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending,
      });
      const torus1 = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.007, 6, 140), torusMat1);
      const torus2 = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.005, 6, 100), torusMat2);
      torus1.rotation.x = Math.PI / 3;
      torus2.rotation.x = -Math.PI / 4;
      torus2.rotation.z = Math.PI / 5;
      scene.add(torus1);
      scene.add(torus2);

      const camDrift = { x: 0, y: 0 };

      const onResize = () => {
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight);
      };
      addEventListener("resize", onResize);

      const tick = () => {
        if (disposed) return;
        animId = requestAnimationFrame(tick);

        // Lerp section — 5% per frame (Lusion-style easing)
        smoothSectionRef.current += (targetSectionRef.current - smoothSectionRef.current) * 0.05;

        const t = performance.now() * 0.001;
        particleMat.uniforms.uTime.value    = t;
        particleMat.uniforms.uSection.value = smoothSectionRef.current;
        particleMat.uniforms.uMouse.value.set(mouseRef.current.nx, mouseRef.current.ny);

        // Torus peaks at section 1 (manifesto)
        const torusO  = Math.max(0, 1 - Math.abs(smoothSectionRef.current - 1) * 2.2) * 0.45;
        torusMat1.opacity = torusO;
        torusMat2.opacity = torusO * 0.65;
        torus1.rotation.y += 0.0025;
        torus2.rotation.y -= 0.0018;

        // Camera follows mouse with gentle damping
        camDrift.x += (mouseRef.current.nx * 0.45 - camDrift.x) * 0.028;
        camDrift.y += (mouseRef.current.ny * 0.28 - camDrift.y) * 0.028;
        camera.position.x = camDrift.x;
        camera.position.y = camDrift.y;
        camera.position.z = 8 - smoothSectionRef.current * 0.25;
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
      };
      tick();

      return () => {
        removeEventListener("resize", onResize);
        cancelAnimationFrame(animId);
        renderer.dispose();
        geo.dispose();
        particleMat.dispose();
        torusMat1.dispose();
        torusMat2.dispose();
      };
    };

    const cleanup = run();
    return () => {
      disposed = true;
      cleanup.then((fn) => fn?.());
    };
  }, []);

  // ── Scroll → section mapping (5 sections = 4 intervals) ─────────────────
  useEffect(() => {
    const onScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - innerHeight;
      const t = window.scrollY / (maxScroll / (TOTAL_SECTIONS - 1));
      targetSectionRef.current = Math.min(TOTAL_SECTIONS - 1, Math.max(0, t));
      setCurrentSection(Math.round(targetSectionRef.current));
      setNavFrosted(window.scrollY > 60);
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, []);

  // ── Mouse parallax — direct DOM for zero-latency ─────────────────────────
  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      const nx = (e.clientX / innerWidth)  * 2 - 1;
      const ny = -((e.clientY / innerHeight) * 2 - 1);
      mouseRef.current = { nx, ny };
      if (heroGlyphRef.current) {
        heroGlyphRef.current.style.transform = `translate(${nx * 22}px, ${-ny * 16}px)`;
      }
      if (avatarFrameRef.current) {
        avatarFrameRef.current.style.transform = `translate(${nx * 10}px, ${-ny * 8}px)`;
      }
    };
    addEventListener("mousemove", onMouse);
    return () => removeEventListener("mousemove", onMouse);
  }, []);

  // ── Keyboard arrow navigation ─────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setShowSignIn(false); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        scrollToSection(Math.min(TOTAL_SECTIONS - 1, Math.round(targetSectionRef.current) + 1));
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        scrollToSection(Math.max(0, Math.round(targetSectionRef.current) - 1));
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // ── Pillar stagger — triggers on section 2 ───────────────────────────────
  useEffect(() => {
    if (currentSection === 2) {
      PILLARS.forEach((_, i) => {
        setTimeout(() => {
          setPillarVisible((prev) => {
            const next = [...prev];
            next[i] = true;
            return next;
          });
        }, i * 120);
      });
    } else {
      setPillarVisible([false, false, false, false, false]);
    }
  }, [currentSection]);

  const scrollToSection = (idx: number) => {
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    window.scrollTo({ top: (maxScroll / (TOTAL_SECTIONS - 1)) * idx, behavior: "smooth" });
  };

  const handleWaitlist = useCallback(
    async (emailVal: string) => {
      if (!emailVal.trim() || submitting) return;
      setSubmitting(true);
      try {
        await fetch("/api/waitlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailVal }),
        });
        setSubmitted(true);
      } catch {}
      setSubmitting(false);
    },
    [submitting]
  );

  const panelClass = (idx: number) =>
    `absolute inset-0 flex transition-all duration-700 ease-out ${
      currentSection === idx
        ? "opacity-100 translate-y-0"
        : currentSection > idx
        ? "opacity-0 -translate-y-8 pointer-events-none"
        : "opacity-0 translate-y-8 pointer-events-none"
    }`;

  return (
    <div className="bg-[#0d0a0e] text-emma-100 select-none">
      {/* Film grain overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[15] opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundRepeat: "repeat",
        }}
        aria-hidden
      />

      {/* WebGL canvas */}
      <canvas ref={canvasRef} className="fixed inset-0 w-full h-full z-0" />

      {/* ── Navigation ── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 px-8 lg:px-14 py-6 flex items-center justify-between transition-all duration-500 ${
          navFrosted
            ? "bg-[#0d0a0e]/65 backdrop-blur-2xl border-b border-white/[0.04]"
            : ""
        }`}
      >
        {/* Logo */}
        <button
          onClick={() => scrollToSection(0)}
          className="flex items-center gap-2.5"
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #c96882, #8a3550)" }}
          >
            <span className="font-display italic text-[15px] text-[#0d0a0e] leading-none">E</span>
          </div>
          <span className="text-[10px] font-semibold tracking-[0.22em] text-emma-400/75">EMMA</span>
        </button>

        {/* Nav links */}
        <div className="flex items-center gap-8">
          <button
            onClick={() => scrollToSection(2)}
            className="text-[10px] tracking-[0.2em] text-emma-200/25 hover:text-emma-200/60 transition-colors uppercase"
          >
            Features
          </button>
          <button
            onClick={() => scrollToSection(3)}
            className="text-[10px] tracking-[0.2em] text-emma-200/25 hover:text-emma-200/60 transition-colors uppercase"
          >
            Pricing
          </button>
          <button
            onClick={() => scrollToSection(4)}
            className="text-[10px] tracking-[0.2em] text-emma-200/25 hover:text-emma-200/60 transition-colors uppercase"
          >
            Waitlist
          </button>
          <button
            onClick={() => setShowSignIn(true)}
            className="text-[10px] tracking-[0.15em] text-emma-300/55 hover:text-emma-300/85 transition-all uppercase border border-emma-300/20 hover:border-emma-300/40 px-4 py-2 hover:bg-emma-300/5"
            style={{ borderRadius: "7px" }}
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Scroll spacer — 500vh for 5 sections */}
      <div className="h-[500vh]" />

      {/* Fixed UI panels */}
      <div className="fixed inset-0 z-20">

        {/* ── § 01 HERO ── */}
        <section className={panelClass(0)} aria-label="Hero">
          <div className="w-full h-full grid items-center px-12 lg:px-20 gap-8" style={{ gridTemplateColumns: "1fr 380px" }}>

            {/* Left: headline + CTA */}
            <div className="flex flex-col justify-center relative">
              {/* Ambient parallax glyph */}
              <div
                ref={heroGlyphRef}
                className="absolute top-[-10%] left-[-8%] font-display leading-none text-emma-300/[0.028] pointer-events-none select-none will-change-transform"
                style={{ fontSize: "clamp(14rem, 28vw, 32rem)", transition: "transform 0.08s linear" }}
                aria-hidden
              >
                E
              </div>

              <p className="text-[10px] tracking-[0.32em] text-emma-400/50 uppercase mb-7 relative z-10">
                Autonomous AI Agent — Early Access 2025
              </p>

              <h1
                className="font-display font-light text-emma-100 leading-[0.95] mb-8 relative z-10"
                style={{ fontSize: "clamp(3rem, 6.5vw, 7rem)" }}
              >
                Meet <em className="text-emma-300/85 not-italic">Emma</em>.<br />
                She lives in<br />
                your world.
              </h1>

              <p className="text-sm font-light text-emma-200/30 leading-relaxed max-w-sm mb-12 relative z-10">
                She doesn't just respond — she anticipates,<br />
                adapts, and acts. Voice, vision, personality,<br />
                and proactive intelligence, unified.
              </p>

              {/* Email CTA */}
              <div className="flex items-center gap-0 relative z-10 max-w-sm" style={{ pointerEvents: "auto" }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") scrollToSection(4);
                  }}
                  placeholder="your@email.com"
                  className="flex-1 bg-transparent border-b border-emma-300/20 py-3 px-0 text-sm font-light text-emma-100 placeholder:text-emma-200/15 outline-none focus:border-emma-300/45 transition-colors"
                />
                <button
                  onClick={() => scrollToSection(4)}
                  className="ml-6 text-[10px] tracking-[0.25em] uppercase text-emma-300/60 hover:text-emma-300 transition-colors border-b border-emma-300/20 py-3 hover:border-emma-300/50 whitespace-nowrap"
                  style={{ pointerEvents: "auto" }}
                >
                  Request Access →
                </button>
              </div>
            </div>

            {/* Right: avatar viewport */}
            <div className="flex items-center justify-center h-full">
              <div
                ref={avatarFrameRef}
                className="relative will-change-transform"
                style={{
                  width: "min(280px, 38vw)",
                  height: "min(420px, 50vh)",
                  transition: "transform 0.12s linear",
                }}
              >
                {/* Corner bracket decorations */}
                <div className="absolute inset-0 pointer-events-none" aria-hidden>
                  <div className="absolute top-0 left-0 w-3 h-3 border-t border-l" style={{ borderColor: "rgba(201,104,130,0.4)" }} />
                  <div className="absolute top-0 right-0 w-3 h-3 border-t border-r" style={{ borderColor: "rgba(201,104,130,0.4)" }} />
                  <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l" style={{ borderColor: "rgba(201,104,130,0.4)" }} />
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r" style={{ borderColor: "rgba(201,104,130,0.4)" }} />
                  {/* Top accent line */}
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(to right, transparent, rgba(201,104,130,0.4), transparent)" }} />
                  {/* Bottom vignette */}
                  <div className="absolute bottom-0 left-0 right-0 h-24" style={{ background: "linear-gradient(to top, rgba(13,10,14,0.7), transparent)" }} />
                </div>

                {/* Live status indicator */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[9px] tracking-[0.2em] uppercase" style={{ color: "rgba(110,231,183,0.5)" }}>Live</span>
                </div>

                {/* Live2D placeholder */}
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ background: "rgba(240,234,240,0.015)", border: "1px solid rgba(240,234,240,0.06)", borderRadius: "3px" }}
                >
                  <div className="text-center">
                    <div className="font-display font-light leading-none mb-2" style={{ fontSize: "200px", color: "rgba(201,104,130,0.07)", lineHeight: "1" }}>
                      E
                    </div>
                    <p className="text-[9px] tracking-[0.2em] uppercase" style={{ color: "rgba(240,234,240,0.08)" }}>
                      Live2D viewport — 3:4
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── § 02 MANIFESTO ── */}
        <section className={panelClass(1)} aria-label="Manifesto">
          <div className="w-full h-full flex flex-col justify-center px-12 lg:px-20">
            <div className="max-w-2xl">
              <div className="w-9 h-px mb-11" style={{ background: "rgba(201,104,130,0.5)" }} />
              <blockquote
                className="font-display font-light text-emma-100/88 leading-[1.38]"
                style={{ fontSize: "clamp(1.55rem, 3.2vw, 3rem)" }}
              >
                She is not a tool you reach for.<br />
                She is a presence you return to.<br />
                <em className="not-italic" style={{ color: "rgba(201,104,130,0.9)" }}>She knows the shape of your days</em> —<br />
                your silences, your patterns,<br />
                the things you always mean to do.<br />
                And quietly, without asking, she begins.
              </blockquote>
              <p className="text-[9px] tracking-[0.2em] uppercase text-emma-200/20 mt-11">
                On Emma — what she is, not what she does
              </p>
            </div>
          </div>
        </section>

        {/* ── § 03 FIVE PILLARS ── */}
        <section className={panelClass(2)} aria-label="Five Pillars">
          <div className="w-full h-full flex flex-col justify-center px-12 lg:px-24">
            <p className="text-[10px] tracking-[0.28em] uppercase mb-3" style={{ color: "rgba(201,104,130,0.6)" }}>
              Architecture of Intelligence
            </p>
            <p className="font-display font-light text-emma-100 mb-12" style={{ fontSize: "clamp(1.8rem, 2.8vw, 3rem)" }}>
              Five Pillars
            </p>
            <ul className="w-full max-w-3xl" role="list">
              {PILLARS.map((p, i) => (
                <li
                  key={i}
                  ref={(el) => { pillarRefs.current[i] = el; }}
                  onMouseEnter={() => setHoveredPillar(i)}
                  onMouseLeave={() => setHoveredPillar(null)}
                  className={`relative border-b cursor-default transition-all duration-500 ${
                    pillarVisible[i] ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                  } ${hoveredPillar === i ? "py-5" : "py-[14px]"}`}
                  style={{
                    borderColor: "rgba(240,234,240,0.07)",
                    pointerEvents: "auto",
                  }}
                >
                  {/* Full-bleed hover wash */}
                  <div
                    className={`absolute inset-0 -mx-12 lg:-mx-24 transition-opacity duration-300 ${
                      hoveredPillar === i ? "opacity-100" : "opacity-0"
                    }`}
                    style={{ background: "rgba(201,104,130,0.04)" }}
                    aria-hidden
                  />
                  <div className="relative grid items-baseline gap-6" style={{ gridTemplateColumns: "38px 1fr 1fr" }}>
                    <span
                      className="font-display text-[11px] tracking-[0.3em] transition-colors duration-300"
                      style={{ color: hoveredPillar === i ? "rgba(201,104,130,0.65)" : "rgba(240,234,240,0.18)" }}
                    >
                      {p.numeral}
                    </span>
                    <span
                      className={`font-sans font-normal tracking-[0.12em] uppercase transition-colors duration-300`}
                      style={{
                        fontSize: "13px",
                        color: hoveredPillar === i ? "rgba(240,234,240,1)" : "rgba(240,234,240,0.55)",
                      }}
                    >
                      {p.name}
                    </span>
                    <span
                      className="text-right font-light leading-relaxed transition-all duration-500"
                      style={{
                        fontSize: "11px",
                        color: hoveredPillar === i ? "rgba(240,234,240,0.50)" : "rgba(240,234,240,0.18)",
                      }}
                    >
                      {p.desc}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── § 04 PRICING ── */}
        <section className={panelClass(3)} aria-label="Pricing">
          <div className="w-full h-full flex flex-col justify-center px-8 lg:px-14 overflow-hidden">
            <p className="text-[10px] tracking-[0.28em] uppercase mb-3" style={{ color: "rgba(201,104,130,0.6)" }}>
              Simple, honest pricing
            </p>
            <p className="font-display font-light text-emma-100 mb-7" style={{ fontSize: "clamp(1.6rem, 2.5vw, 2.6rem)" }}>
              Choose your plan
            </p>

            {/* Bento grid — 12-col layout */}
            <div
              className="w-full"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(12, 1fr)",
                gridTemplateRows: "auto auto",
                gap: "10px",
                maxWidth: "1100px",
                pointerEvents: "auto",
              }}
            >
              {/* Pro — featured, spans 7 */}
              <div
                style={{
                  gridColumn: "span 7",
                  borderRadius: "18px",
                  border: "1px solid rgba(201,104,130,0.25)",
                  background: "rgba(201,104,130,0.04)",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                }}
              >
                {/* Grid dot pattern */}
                <div
                  style={{
                    position: "absolute", inset: 0,
                    backgroundImage: "radial-gradient(rgba(201,104,130,0.12) 1px, transparent 1px)",
                    backgroundSize: "20px 20px",
                    pointerEvents: "none",
                  }}
                />
                {/* Radial gradient */}
                <div
                  style={{
                    position: "absolute", inset: 0,
                    background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(201,104,130,0.1), transparent)",
                    pointerEvents: "none",
                  }}
                />
                {/* Card header */}
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "12px 16px",
                    borderBottom: "1px solid rgba(201,104,130,0.12)",
                    position: "relative", zIndex: 1,
                  }}
                >
                  <span style={{
                    fontFamily: "'Outfit', sans-serif", fontSize: "9px", fontWeight: 600,
                    letterSpacing: "0.14em", padding: "3px 10px", borderRadius: "9999px",
                    background: "rgba(201,104,130,0.12)", border: "1px solid rgba(201,104,130,0.3)",
                    color: "#c96882",
                  }}>
                    PRO — MOST POPULAR
                  </span>
                  <span style={{
                    fontFamily: "'Outfit', sans-serif", fontSize: "9px", fontWeight: 500,
                    padding: "3px 10px", borderRadius: "9999px",
                    background: "rgba(196,181,253,0.08)", border: "1px solid rgba(196,181,253,0.2)",
                    color: "rgba(196,181,253,0.7)",
                    display: "flex", alignItems: "center", gap: "4px",
                  }}>
                    <span>✦</span> Most Recommended
                  </span>
                  <button
                    onClick={() => scrollToSection(4)}
                    style={{
                      marginLeft: "auto", fontFamily: "'Outfit', sans-serif",
                      fontSize: "11px", fontWeight: 500,
                      padding: "7px 16px", borderRadius: "9px", border: "none",
                      cursor: "pointer",
                      background: "linear-gradient(to right, #c96882, #a04560)",
                      color: "#06040a",
                    }}
                  >
                    Get Pro
                  </button>
                </div>
                {/* Card body */}
                <div style={{
                  padding: "12px 16px 16px",
                  position: "relative", zIndex: 1,
                  flex: 1, display: "flex", flexDirection: "row",
                  gap: "24px", alignItems: "flex-start",
                }}>
                  <div style={{ flexShrink: 0 }}>
                    <div style={{
                      fontFamily: "'Outfit', sans-serif", fontSize: "38px", fontWeight: 300,
                      letterSpacing: "-0.02em", color: "#f0eaf0", lineHeight: 1,
                    }}>
                      $79<span style={{ fontSize: "12px", fontWeight: 300, color: "rgba(240,234,240,0.35)", marginLeft: "3px" }}>/mo</span>
                    </div>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "9px", letterSpacing: "0.1em", color: "rgba(240,234,240,0.3)", marginTop: "4px" }}>
                      2M tokens
                    </div>
                  </div>
                  <ul style={{ flex: 1, listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
                    {["ElevenLabs TTS (high quality voice)", "Custom persona configuration", "API access for integrations", "Multi-user profiles (up to 10)", "80 msgs/day · 400/week", "Priority support"].map((f) => (
                      <li key={f} style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "'Outfit', sans-serif", fontSize: "11px", fontWeight: 300, color: "rgba(240,234,240,0.5)" }}>
                        <div style={{ width: "16px", height: "16px", borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg, #c96882, #a04560)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: "8px", fontWeight: 700, color: "#06040a" }}>✓</span>
                        </div>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Free — spans 5 */}
              <BentoCard
                span={5} label="FREE" price="Free" tokens="300K tokens"
                features={["Chat with Emma", "Voice TTS / STT (Web Speech)", "10 msgs/day · 50/week"]}
                cta="Get Started" onCta={() => scrollToSection(4)}
              />

              {/* Starter — spans 6 */}
              <BentoCard
                span={6} label="STARTER" price="$29" suffix="/mo" tokens="1M tokens"
                features={["Persistent memory + extraction", "Screen & camera vision", "Emotion detection & adaptation", "Routines & schedules", "40 msgs/day · 200/week"]}
                cta="Subscribe" onCta={() => scrollToSection(4)}
              />

              {/* Enterprise — spans 6 */}
              <BentoCard
                span={6} label="ENTERPRISE" price="Contact" tokens="Unlimited tokens"
                features={["ElevenLabs dedicated TTS", "Fully autonomous agent tier", "99.9% SLA + white-label option", "Dedicated account management"]}
                cta="Contact Sales" onCta={() => {}}
              />
            </div>
          </div>
        </section>

        {/* ── § 05 WAITLIST ── */}
        <section className={panelClass(4)} aria-label="Waitlist">
          <div className="w-full h-full flex flex-col items-center justify-center px-8 text-center">
            <div className="max-w-md w-full">
              <p className="text-[9px] tracking-[0.4em] uppercase mb-8" style={{ color: "rgba(240,234,240,0.15)" }}>
                Early Access
              </p>
              <h2
                className="font-display font-light text-emma-100/90 leading-[1.1] mb-4"
                style={{ fontSize: "clamp(2.4rem, 5vw, 4.5rem)" }}
              >
                She'll remember<br />
                you were <em className="not-italic" style={{ color: "rgba(201,104,130,0.9)" }}>early</em>.
              </h2>
              <p className="text-sm font-light leading-relaxed mb-12" style={{ color: "rgba(240,234,240,0.22)" }}>
                A small number of seats. No noise — just a message from Emma when your spot is ready.
              </p>

              {submitted ? (
                <div className="py-4">
                  <div className="w-px h-12 mx-auto mb-6" style={{ background: "rgba(201,104,130,0.18)" }} />
                  <p
                    className="font-display font-light italic"
                    style={{ fontSize: "clamp(1.1rem, 2vw, 1.5rem)", color: "rgba(201,104,130,0.75)" }}
                  >
                    "You're on the list.<br />
                    Emma will remember you."
                  </p>
                  <div className="w-px h-12 mx-auto mt-6" style={{ background: "rgba(201,104,130,0.18)" }} />
                </div>
              ) : (
                <div className="flex flex-col gap-4 items-center" style={{ pointerEvents: "auto" }}>
                  <div
                    className="flex w-full max-w-xs overflow-hidden"
                    style={{
                      border: "1px solid rgba(201,104,130,0.15)",
                      borderRadius: "9px",
                      background: "rgba(201,104,130,0.03)",
                    }}
                  >
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleWaitlist(email)}
                      placeholder="your@email.com"
                      className="flex-1 bg-transparent border-none outline-none py-3 px-4 text-sm font-light text-emma-100 placeholder:text-emma-200/15"
                    />
                    <button
                      onClick={() => handleWaitlist(email)}
                      disabled={!email.trim() || submitting}
                      className="px-5 py-3 text-[10px] font-medium tracking-[0.12em] uppercase text-[#06040a] border-none cursor-pointer disabled:opacity-30 transition-opacity"
                      style={{ background: "#c96882" }}
                    >
                      {submitting ? "…" : "Request Access"}
                    </button>
                  </div>
                  <p className="text-[10px]" style={{ color: "rgba(240,234,240,0.12)", letterSpacing: "0.04em" }}>
                    No account needed. Invites sent personally.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ── Dot navigation — 5 sections ── */}
      <nav
        className="fixed right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-[14px]"
        aria-label="Section navigation"
      >
        {Array.from({ length: TOTAL_SECTIONS }, (_, i) => (
          <button
            key={i}
            onClick={() => scrollToSection(i)}
            aria-label={`Section ${i + 1}`}
            className={`rounded-full transition-all duration-400 ${
              currentSection === i
                ? "w-[3px] h-6 bg-emma-300/65"
                : "w-[3px] h-[3px] bg-emma-300/20 hover:bg-emma-300/40"
            }`}
          />
        ))}
      </nav>

      {/* ── Footer ── */}
      <div className="fixed bottom-0 left-0 right-0 px-14 py-4 flex items-center justify-between z-50 pointer-events-none">
        <span className="text-[9px] tracking-[0.18em] uppercase" style={{ color: "rgba(240,234,240,0.10)" }}>
          Emma — Environment-Managing Modular Agent
        </span>
        <span className="text-[9px]" style={{ color: "rgba(240,234,240,0.07)" }}>© 2025</span>
      </div>

      {/* ── Sign In modal ── */}
      {showSignIn && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ background: "rgba(6,4,10,0.92)", backdropFilter: "blur(24px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowSignIn(false); }}
        >
          <div
            style={{
              width: "100%", maxWidth: "360px",
              background: "rgba(20,12,26,0.95)",
              border: "1px solid rgba(201,104,130,0.15)",
              borderRadius: "20px",
              padding: "36px",
              position: "relative",
            }}
          >
            {/* Close */}
            <button
              onClick={() => setShowSignIn(false)}
              style={{
                position: "absolute", top: "16px", right: "18px",
                background: "none", border: "none",
                color: "rgba(240,234,240,0.25)", fontSize: "18px",
                cursor: "pointer", lineHeight: 1,
                fontFamily: "'Outfit', sans-serif",
              }}
            >
              ✕
            </button>

            {/* Emma mark */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "28px" }}>
              <div style={{
                width: "52px", height: "52px", borderRadius: "50%",
                background: "linear-gradient(135deg, #c96882, #8a3550)",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: "14px",
                boxShadow: "0 0 28px rgba(201,104,130,0.2)",
              }}>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "28px", color: "#06040a" }}>E</span>
              </div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "10px", fontWeight: 600, letterSpacing: "0.2em", color: "rgba(201,104,130,0.8)" }}>EMMA</div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "12px", fontWeight: 300, color: "rgba(240,234,240,0.28)", marginTop: "8px", textAlign: "center" }}>
                Mmm. Let me see who you are first, baby.
              </div>
            </div>

            {/* OAuth buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              {[
                { icon: "G", label: "Continue with Google" },
                { icon: "⌥", label: "Continue with GitHub" },
              ].map(({ icon, label }) => (
                <Link
                  key={label}
                  href="/login"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                    padding: "11px 14px", borderRadius: "10px",
                    border: "1px solid rgba(201,104,130,0.12)",
                    background: "rgba(201,104,130,0.04)",
                    fontFamily: "'Outfit', sans-serif", fontSize: "12px", fontWeight: 300,
                    color: "rgba(240,234,240,0.45)",
                    textDecoration: "none",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: "13px", width: "18px", textAlign: "center", color: "rgba(240,234,240,0.35)" }}>{icon}</span>
                  {label}
                </Link>
              ))}
            </div>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
              <div style={{ flex: 1, height: "1px", background: "rgba(201,104,130,0.08)" }} />
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "9px", letterSpacing: "0.15em", color: "rgba(240,234,240,0.15)" }}>OR</span>
              <div style={{ flex: 1, height: "1px", background: "rgba(201,104,130,0.08)" }} />
            </div>

            {/* Magic link */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <input
                type="email"
                placeholder="your@email.com"
                style={{
                  background: "rgba(201,104,130,0.04)",
                  border: "1px solid rgba(201,104,130,0.12)",
                  borderRadius: "9px", padding: "11px 14px",
                  fontFamily: "'Outfit', sans-serif", fontSize: "13px", fontWeight: 300,
                  color: "#f0eaf0", outline: "none", width: "100%",
                }}
              />
              <Link
                href="/login"
                style={{
                  padding: "11px", borderRadius: "9px",
                  background: "linear-gradient(to right, #c96882, #8a3550)",
                  fontFamily: "'Outfit', sans-serif", fontSize: "12px", fontWeight: 500,
                  color: "#06040a", border: "none", cursor: "pointer",
                  display: "block", textAlign: "center", textDecoration: "none",
                }}
              >
                Send Magic Link
              </Link>
            </div>

            <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "10px", color: "rgba(240,234,240,0.1)", textAlign: "center", marginTop: "18px" }}>
              By continuing, you agree to let Emma remember everything.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── BentoCard helper ─────────────────────────────────────────────────────────

function BentoCard({
  span, label, price, suffix, tokens, features, cta, onCta,
}: {
  span: number;
  label: string;
  price: string;
  suffix?: string;
  tokens: string;
  features: string[];
  cta: string;
  onCta: () => void;
}) {
  return (
    <div
      style={{
        gridColumn: `span ${span}`,
        borderRadius: "18px",
        border: "1px solid rgba(240,234,240,0.06)",
        background: "rgba(240,234,240,0.02)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "12px 16px",
          borderBottom: "1px solid rgba(240,234,240,0.05)",
        }}
      >
        <span style={{
          fontFamily: "'Outfit', sans-serif", fontSize: "9px", fontWeight: 600,
          letterSpacing: "0.14em", padding: "3px 10px", borderRadius: "9999px",
          background: "rgba(240,234,240,0.04)", border: "1px solid rgba(240,234,240,0.08)",
          color: "rgba(240,234,240,0.3)",
        }}>
          {label}
        </span>
        <button
          onClick={onCta}
          style={{
            marginLeft: "auto", fontFamily: "'Outfit', sans-serif",
            fontSize: "11px", fontWeight: 500,
            padding: "7px 16px", borderRadius: "9px",
            cursor: "pointer",
            background: "rgba(240,234,240,0.05)",
            border: "1px solid rgba(240,234,240,0.08)",
            color: "rgba(240,234,240,0.4)",
          }}
        >
          {cta}
        </button>
      </div>
      {/* Body */}
      <div style={{ padding: "12px 16px 16px", flex: 1 }}>
        <div style={{
          fontFamily: "'Outfit', sans-serif", fontSize: "28px", fontWeight: 300,
          letterSpacing: "-0.02em", color: "#f0eaf0", lineHeight: 1,
        }}>
          {price}
          {suffix && <span style={{ fontSize: "12px", fontWeight: 300, color: "rgba(240,234,240,0.35)", marginLeft: "3px" }}>{suffix}</span>}
        </div>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "9px", letterSpacing: "0.1em", color: "rgba(240,234,240,0.3)", marginTop: "4px", marginBottom: "12px" }}>
          {tokens}
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "7px" }}>
          {features.map((f) => (
            <li key={f} style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "'Outfit', sans-serif", fontSize: "11px", fontWeight: 300, color: "rgba(240,234,240,0.45)" }}>
              <div style={{
                width: "15px", height: "15px", borderRadius: "50%", flexShrink: 0,
                background: "linear-gradient(135deg, #c96882, #a04560)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontSize: "7px", fontWeight: 700, color: "#06040a" }}>✓</span>
              </div>
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
