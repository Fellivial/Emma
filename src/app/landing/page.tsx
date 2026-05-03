"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

const PILLARS = [
  {
    numeral: "I",
    name: "Voice",
    desc: "She hears you and speaks back. Real-time, expression-aware, present.",
  },
  {
    numeral: "II",
    name: "Vision",
    desc: "She sees your screen. Context becomes awareness becomes action.",
  },
  {
    numeral: "III",
    name: "Brain",
    desc: "Workflow orchestration. Routine execution. She conducts your workspace.",
  },
  {
    numeral: "IV",
    name: "Personality",
    desc: "Persistent memory. Emotion. She adapts to who you are over time.",
  },
  {
    numeral: "V",
    name: "Proactive",
    desc: "She does not wait to be asked. Anticipation is intelligence.",
  },
];

const VERTEX_SHADER = `
  attribute vec3 aBasePos;
  attribute float aPhase;
  attribute float aSize;

  uniform float uTime;
  uniform float uSection;
  uniform vec2 uMouse;

  void main() {
    vec3 pos = aBasePos;

    // Slow breathing drift — each particle has its own phase
    pos.y += sin(uTime * 0.22 + aPhase) * 0.18;
    pos.x += cos(uTime * 0.17 + aPhase * 1.4) * 0.12;
    pos.z += sin(uTime * 0.11 + aPhase * 0.8) * 0.09;

    // Section 0 → 1: rise and dissolve upward
    float s01 = clamp(uSection, 0.0, 1.0);
    pos.y += s01 * (2.5 + fract(aPhase) * 2.5);

    // Section 1 → 2: horizontal banding (5 bands for 5 pillars)
    float s12 = clamp(uSection - 1.0, 0.0, 1.0);
    float bandIdx = floor(aPhase / (6.2831 / 5.0));
    float bandY = (bandIdx - 2.0) * 1.4;
    pos.y = mix(pos.y, bandY, s12 * 0.65);
    pos.x = mix(pos.x, aBasePos.x * 1.8, s12 * 0.25);

    // Section 2 → 3: converge to center (waitlist — intimacy)
    float s23 = clamp(uSection - 2.0, 0.0, 1.0);
    pos = mix(pos, vec3(0.0, 0.0, aBasePos.z * 0.15), s23 * 0.8);

    // Mouse repulsion — hero only, fades with section
    float heroW = 1.0 - smoothstep(0.0, 0.9, uSection);
    vec2 toMouse = pos.xy - uMouse * 5.5;
    float d = length(toMouse);
    float rep = heroW * smoothstep(2.2, 0.1, d) * 0.9;
    pos.xy += normalize(toMouse + vec2(0.0001)) * rep;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;
    gl_PointSize = aSize * (420.0 / -mvPos.z);
  }
`;

const FRAGMENT_SHADER = `
  uniform float uOpacity;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv) * 2.0;
    if (r > 1.0) discard;
    float alpha = (1.0 - r) * (1.0 - r) * uOpacity;
    gl_FragColor = vec4(0.91, 0.70, 0.82, alpha);
  }
`;

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroGlyphRef = useRef<HTMLDivElement>(null);
  const avatarFrameRef = useRef<HTMLDivElement>(null);
  const pillarRefs = useRef<(HTMLLIElement | null)[]>([]);

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentSection, setCurrentSection] = useState(0);
  const [navFrosted, setNavFrosted] = useState(false);
  const [hoveredPillar, setHoveredPillar] = useState<number | null>(null);
  const [pillarVisible, setPillarVisible] = useState<boolean[]>([false, false, false, false, false]);

  const smoothSectionRef = useRef(0);
  const targetSectionRef = useRef(0);
  const mouseRef = useRef({ nx: 0, ny: 0 });

  // Three.js scene
  useEffect(() => {
    let disposed = false;
    let animId = 0;

    const run = async () => {
      if (!canvasRef.current) return;
      const THREE = await import("three");
      if (disposed || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(innerWidth, innerHeight);
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
      camera.position.z = 8;

      // — Particles —
      const COUNT = 3800;
      const basePos = new Float32Array(COUNT * 3);
      const phases = new Float32Array(COUNT);
      const sizes = new Float32Array(COUNT);

      for (let i = 0; i < COUNT; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 2.5 + Math.random() * 2.5;
        const disk = 0.45 + Math.random() * 0.55;
        basePos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        basePos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * disk;
        basePos[i * 3 + 2] = r * Math.cos(phi) * 0.55;
        phases[i] = Math.random() * Math.PI * 2;
        sizes[i] = 0.4 + Math.random() * 1.8;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(basePos.slice(), 3));
      geo.setAttribute("aBasePos", new THREE.BufferAttribute(basePos, 3));
      geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
      geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

      const particleMat = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          uTime: { value: 0 },
          uSection: { value: 0 },
          uMouse: { value: new THREE.Vector2(0, 0) },
          uOpacity: { value: 0.65 },
        },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      });

      const points = new THREE.Points(geo, particleMat);
      scene.add(points);

      // — Torus rings (manifesto section) —
      const torusMat1 = new THREE.MeshBasicMaterial({
        color: 0xe8a0bf,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
      });
      const torusMat2 = new THREE.MeshBasicMaterial({
        color: 0xc77dba,
        transparent: true,
        opacity: 0,
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

        // Lerp section — 5% per frame is ~Lusion easing
        smoothSectionRef.current += (targetSectionRef.current - smoothSectionRef.current) * 0.05;

        const t = performance.now() * 0.001;
        particleMat.uniforms.uTime.value = t;
        particleMat.uniforms.uSection.value = smoothSectionRef.current;
        particleMat.uniforms.uMouse.value.set(mouseRef.current.nx, mouseRef.current.ny);

        // Torus peaks at section 1 (manifesto)
        const torusO = Math.max(0, 1 - Math.abs(smoothSectionRef.current - 1) * 2.2) * 0.45;
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

  // Scroll → section mapping
  useEffect(() => {
    const onScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - innerHeight;
      const t = window.scrollY / (maxScroll / 3);
      targetSectionRef.current = Math.min(3, Math.max(0, t));
      setCurrentSection(Math.round(targetSectionRef.current));
      setNavFrosted(window.scrollY > 60);
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, []);

  // Mouse parallax — direct DOM for zero-latency
  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      const nx = (e.clientX / innerWidth) * 2 - 1;
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

  // Keyboard arrow navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        scrollToSection(Math.min(3, Math.round(targetSectionRef.current) + 1));
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        scrollToSection(Math.max(0, Math.round(targetSectionRef.current) - 1));
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // IntersectionObserver stagger for pillar rows
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    pillarRefs.current.forEach((el, i) => {
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setTimeout(() => {
              setPillarVisible((prev) => {
                const next = [...prev];
                next[i] = true;
                return next;
              });
            }, i * 120);
            obs.disconnect();
          }
        },
        { threshold: 0.1 }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  // When section changes to 2, trigger pillar stagger
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
    } else if (currentSection !== 2) {
      setPillarVisible([false, false, false, false, false]);
    }
  }, [currentSection]);

  const scrollToSection = (idx: number) => {
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    window.scrollTo({ top: (maxScroll / 3) * idx, behavior: "smooth" });
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

      {/* Navigation */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 px-8 py-5 flex items-center justify-between transition-all duration-500 ${
          navFrosted
            ? "bg-[#0d0a0e]/65 backdrop-blur-2xl border-b border-white/[0.04]"
            : ""
        }`}
      >
        <button
          onClick={() => scrollToSection(0)}
          className="font-display text-sm italic text-emma-300/70 tracking-widest hover:text-emma-300 transition-colors"
        >
          EMMA
        </button>
        <div className="flex items-center gap-8">
          <button
            onClick={() => scrollToSection(2)}
            className="text-[11px] tracking-[0.2em] text-emma-200/25 hover:text-emma-200/60 transition-colors uppercase"
          >
            Pillars
          </button>
          <button
            onClick={() => scrollToSection(3)}
            className="text-[11px] tracking-[0.2em] text-emma-200/25 hover:text-emma-200/60 transition-colors uppercase"
          >
            Access
          </button>
          <Link
            href="/login"
            className="text-[11px] tracking-[0.15em] text-emma-300/50 hover:text-emma-300/80 transition-colors uppercase border border-emma-300/15 px-4 py-2 hover:border-emma-300/30"
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* Scroll driver — 400vh triggers native scroll events */}
      <div className="h-[400vh]" />

      {/* Fixed UI panels */}
      <div className="fixed inset-0 z-20">

        {/* ── § 01 HERO ── */}
        <section className={panelClass(0)} aria-label="Hero">
          <div className="w-full h-full grid grid-cols-2 items-center px-12 lg:px-20 gap-8">

            {/* Left: headline + CTA */}
            <div className="flex flex-col justify-center relative">
              {/* Ambient glyph — parallax depth layer */}
              <div
                ref={heroGlyphRef}
                className="absolute top-[-10%] left-[-8%] font-display leading-none text-emma-300/[0.028] pointer-events-none select-none will-change-transform"
                style={{
                  fontSize: "clamp(14rem, 28vw, 32rem)",
                  transition: "transform 0.08s linear",
                }}
                aria-hidden
              >
                E
              </div>

              <p className="text-[10px] tracking-[0.35em] text-emma-300/40 uppercase mb-8 relative z-10">
                Environment-Managing Modular Agent
              </p>

              <h1
                className="font-display font-light text-emma-100 leading-[0.92] mb-8 relative z-10"
                style={{ fontSize: "clamp(3rem, 6.5vw, 7rem)" }}
              >
                She does not{" "}
                <em className="text-emma-300 not-italic font-extralight">respond</em>
                .<br />
                She{" "}
                <em className="text-emma-300 not-italic font-extralight">remembers</em>
                .
              </h1>

              <p className="text-sm font-light text-emma-200/30 leading-relaxed max-w-sm mb-12 relative z-10">
                An autonomous presence with voice, vision, and will.
                Built to inhabit your workspace — not serve it.
              </p>

              {/* Email CTA — address carried forward on Enter */}
              <div className="flex items-center gap-0 relative z-10 max-w-sm" style={{ pointerEvents: "auto" }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") scrollToSection(3);
                  }}
                  placeholder="your@email.com"
                  className="flex-1 bg-transparent border-b border-emma-300/20 py-3 px-0 text-sm font-light text-emma-100 placeholder:text-emma-200/15 outline-none focus:border-emma-300/45 transition-colors"
                />
                <button
                  onClick={() => scrollToSection(3)}
                  className="ml-6 text-[10px] tracking-[0.25em] uppercase text-emma-300/60 hover:text-emma-300 transition-colors border-b border-emma-300/20 py-3 hover:border-emma-300/50 whitespace-nowrap"
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
                  width: "min(360px, 42vw)",
                  height: "min(460px, 52vh)",
                  transition: "transform 0.12s linear",
                }}
              >
                {/* Corner bracket decorations */}
                <div className="absolute inset-0 pointer-events-none" aria-hidden>
                  <div className="absolute top-0 left-0 w-7 h-7 border-t border-l border-emma-300/30" />
                  <div className="absolute top-0 right-0 w-7 h-7 border-t border-r border-emma-300/30" />
                  <div className="absolute bottom-0 left-0 w-7 h-7 border-b border-l border-emma-300/30" />
                  <div className="absolute bottom-0 right-0 w-7 h-7 border-b border-r border-emma-300/30" />
                </div>

                {/* Live status indicator */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[9px] tracking-[0.2em] text-emma-200/30 uppercase">Live</span>
                </div>

                {/* Placeholder — replaced by Live2D when model files present */}
                <div className="w-full h-full flex items-center justify-center bg-emma-950/40">
                  <div className="text-center">
                    <div className="font-display text-[7rem] leading-none text-emma-300/12 mb-3">
                      ✦
                    </div>
                    <p className="text-[9px] tracking-[0.3em] text-emma-200/12 uppercase">
                      Live2D
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── § 02 MANIFESTO ── */}
        <section className={panelClass(1)} aria-label="Manifesto">
          <div className="w-full h-full flex flex-col items-center justify-center px-8 text-center">
            <div className="max-w-3xl">
              <div className="w-14 h-px bg-emma-300/25 mx-auto mb-16" />
              <blockquote
                className="font-display font-extralight text-emma-100/88 leading-[1.28]"
                style={{ fontSize: "clamp(1.5rem, 3.8vw, 3.6rem)" }}
              >
                "She was not built to{" "}
                <em className="text-emma-300/75 not-italic">answer</em> questions.
                <br />
                She was built to{" "}
                <em className="text-emma-300/75 not-italic">understand</em> them
                <br />
                before you think to ask."
              </blockquote>
              <div className="w-14 h-px bg-emma-300/25 mx-auto mt-16" />
            </div>
          </div>
        </section>

        {/* ── § 03 FIVE PILLARS ── */}
        <section className={panelClass(2)} aria-label="Five Pillars">
          <div className="w-full h-full flex flex-col justify-center px-12 lg:px-24">
            <p className="text-[9px] tracking-[0.4em] uppercase text-emma-300/25 mb-10">
              Five Pillars of Intelligence
            </p>
            <ul className="w-full max-w-3xl" role="list">
              {PILLARS.map((p, i) => (
                <li
                  key={i}
                  ref={(el) => {
                    pillarRefs.current[i] = el;
                  }}
                  onMouseEnter={() => setHoveredPillar(i)}
                  onMouseLeave={() => setHoveredPillar(null)}
                  className={`relative border-b border-emma-300/[0.07] cursor-default transition-all duration-500 ${
                    pillarVisible[i] ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                  } ${hoveredPillar === i ? "py-5" : "py-[14px]"}`}
                  style={{ pointerEvents: "auto" }}
                >
                  {/* Full-bleed hover wash */}
                  <div
                    className={`absolute inset-0 -mx-12 lg:-mx-24 bg-emma-300/[0.035] transition-opacity duration-300 ${
                      hoveredPillar === i ? "opacity-100" : "opacity-0"
                    }`}
                    aria-hidden
                  />
                  <div className="relative flex items-baseline gap-0 px-1">
                    <span
                      className={`font-display text-[10px] tracking-[0.3em] w-14 shrink-0 transition-colors duration-300 ${
                        hoveredPillar === i ? "text-emma-300/65" : "text-emma-200/18"
                      }`}
                    >
                      {p.numeral}
                    </span>
                    <span
                      className={`font-display font-light leading-none flex-1 transition-colors duration-300 ${
                        hoveredPillar === i ? "text-emma-100" : "text-emma-200/55"
                      }`}
                      style={{ fontSize: "clamp(1.3rem, 2.4vw, 2.1rem)" }}
                    >
                      {p.name}
                    </span>
                    <span
                      className={`text-[11px] font-light text-right max-w-xs leading-relaxed transition-all duration-500 ${
                        hoveredPillar === i
                          ? "text-emma-200/50 opacity-100"
                          : "text-emma-200/18 opacity-50"
                      }`}
                    >
                      {p.desc}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── § 04 WAITLIST ── */}
        <section className={panelClass(3)} aria-label="Waitlist">
          <div className="w-full h-full flex flex-col items-center justify-center px-8 text-center">
            <div className="max-w-md w-full">
              <p className="text-[9px] tracking-[0.4em] uppercase text-emma-300/22 mb-8">
                Early Access
              </p>
              <h2
                className="font-display font-extralight text-emma-100/90 leading-[1.1] mb-4"
                style={{ fontSize: "clamp(2.4rem, 5vw, 4.5rem)" }}
              >
                Meet Emma.
              </h2>
              <p className="text-sm font-light text-emma-200/22 leading-relaxed mb-12">
                A small circle. An intimate waitlist.
                <br />
                She will remember you were early.
              </p>

              {submitted ? (
                <div className="py-4">
                  <div className="w-px h-12 bg-emma-300/18 mx-auto mb-6" />
                  <p
                    className="font-display font-light text-emma-300/75 italic"
                    style={{ fontSize: "clamp(1.1rem, 2vw, 1.5rem)" }}
                  >
                    "You're on the list.
                    <br />
                    Emma will remember you."
                  </p>
                  <div className="w-px h-12 bg-emma-300/18 mx-auto mt-6" />
                </div>
              ) : (
                <div className="flex flex-col gap-4 items-center" style={{ pointerEvents: "auto" }}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleWaitlist(email)}
                    placeholder="your@email.com"
                    className="w-full bg-transparent border-b border-emma-300/18 py-3 text-center text-sm font-light text-emma-100 placeholder:text-emma-200/15 outline-none focus:border-emma-300/40 transition-colors"
                  />
                  <button
                    onClick={() => handleWaitlist(email)}
                    disabled={!email.trim() || submitting}
                    className="text-[10px] tracking-[0.3em] uppercase text-emma-300/55 hover:text-emma-300 disabled:text-emma-200/18 transition-colors mt-2 border-b border-emma-300/18 hover:border-emma-300/45 disabled:border-transparent pb-1"
                  >
                    {submitting ? "Sending…" : "Request Access"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Dot navigation — pill/line style */}
      <nav
        className="fixed right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-[14px]"
        aria-label="Section navigation"
      >
        {[0, 1, 2, 3].map((i) => (
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
    </div>
  );
}
