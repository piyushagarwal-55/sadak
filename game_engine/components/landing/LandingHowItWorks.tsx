"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Map, Mic, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE_OUT, SectionKicker, SectionTitle } from "./LandingHero";

/* ─────────────────────────── mini visuals ─────────────────────────── */

/** One neobrutalist keycap. */
function Keycap({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span
      className={cn(
        "flex size-7 items-center justify-center rounded-[4px] border-2 border-border text-[11px] font-extrabold uppercase shadow-[2px_2px_0_0_var(--border)] transition-all duration-150",
        active
          ? "-translate-y-0.5 bg-main text-main-foreground shadow-[3px_3px_0_0_var(--border)]"
          : "bg-secondary-background text-foreground/70"
      )}
    >
      {children}
    </span>
  );
}

/** Step 1 — the ten scripts, cycling. */
const SCRIPTS = [
  { native: "తెలుగు", city: "Hyderabad" },
  { native: "हिन्दी", city: "Old Delhi" },
  { native: "தமிழ்", city: "Chennai" },
  { native: "ਪੰਜਾਬੀ", city: "Amritsar" },
  { native: "বাংলা", city: "Kolkata" },
  { native: "ଓଡ଼ିଆ", city: "Bhubaneswar" },
];
function ScriptCycler({ play }: { play: boolean }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce || !play) return;
    const id = setInterval(() => setI((v) => (v + 1) % SCRIPTS.length), 1500);
    return () => clearInterval(id);
  }, [reduce, play]);

  const s = SCRIPTS[i]!;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-3">
      <span className="font-indic text-3xl font-heading leading-none text-foreground">
        {s.native}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-foreground/45">
        {s.city}
      </span>
    </div>
  );
}

/** Step 2 — a prompt box typing situations on a loop. */
const PROMPTS = [
  "I have to buy vegetables at the market",
  "I need a ticket at the railway station",
  "getting a haircut before the wedding",
];
function PromptTyper({ play }: { play: boolean }) {
  const reduce = useReducedMotion();
  const [text, setText] = useState(reduce ? PROMPTS[0]! : "");
  const [p, setP] = useState(0);

  useEffect(() => {
    if (reduce || !play) return;
    let i = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const full = PROMPTS[p] ?? "";
    const tick = () => {
      if (!deleting) {
        i++;
        setText(full.slice(0, i));
        if (i >= full.length) {
          deleting = true;
          timer = setTimeout(tick, 1400);
          return;
        }
      } else {
        i--;
        setText(full.slice(0, i));
        if (i <= 0) {
          setP((v) => (v + 1) % PROMPTS.length);
          return;
        }
      }
      timer = setTimeout(tick, deleting ? 22 : 42);
    };
    timer = setTimeout(tick, 260);
    return () => clearTimeout(timer);
  }, [p, reduce, play]);

  return (
    <div className="flex h-full w-full flex-col justify-center gap-2 p-3">
      <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-foreground/40">
        describe a situation
      </span>
      <div className="rounded-[6px] border-2 border-border bg-secondary-background px-2.5 py-2">
        <p className="min-h-[2.4em] font-mono text-[11px] font-semibold leading-snug text-foreground">
          {text}
          <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-main" />
        </p>
      </div>
    </div>
  );
}

/** Step 3 — WASD lighting in sequence. */
function WasdKeys({ play }: { play: boolean }) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(-1);
  useEffect(() => {
    if (reduce || !play) return;
    let k = 0;
    const id = setInterval(() => {
      setActive(k % 4);
      k++;
    }, 420);
    return () => clearInterval(id);
  }, [reduce, play]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3">
      <Keycap active={active === 0}>W</Keycap>
      <div className="flex gap-1.5">
        <Keycap active={active === 1}>A</Keycap>
        <Keycap active={active === 2}>S</Keycap>
        <Keycap active={active === 3}>D</Keycap>
      </div>
      <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.22em] text-foreground/40">
        move
      </span>
    </div>
  );
}

/** Step 4 — a mic with levels that move while you hold it. */
function MicLevels({ play }: { play: boolean }) {
  const reduce = useReducedMotion();
  const [t, setT] = useState(0);
  useEffect(() => {
    if (reduce || !play) return;
    const id = setInterval(() => setT((v) => v + 1), 140);
    return () => clearInterval(id);
  }, [reduce, play]);

  // Deterministic pseudo-levels: a sine per bar, offset by index. Random
  // heights re-roll every render and flicker; this reads like a voice.
  const bars = Array.from({ length: 7 }, (_, i) =>
    reduce ? 40 : 22 + Math.abs(Math.sin((t + i * 1.6) / 2.2)) * 70
  );

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 p-3">
      <span className="flex size-8 items-center justify-center rounded-base border-2 border-border bg-main text-main-foreground shadow-[2px_2px_0_0_var(--border)]">
        <Mic size={15} strokeWidth={2.5} />
      </span>
      <div className="flex h-8 items-end gap-[3px]">
        {bars.map((h, i) => (
          <span
            key={i}
            className="w-[3px] rounded-full bg-foreground/70 transition-[height] duration-150"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-foreground/40">
        hold and speak
      </span>
    </div>
  );
}

/* ──────────────────────────── the section ──────────────────────────── */

const STEPS = [
  {
    n: "01",
    icon: Map,
    title: "Pick a city",
    body: "Ten of them, each speaking its own language. Then say which language you already read — every hint comes back in that one.",
    Visual: ScriptCycler,
  },
  {
    n: "02",
    icon: PenLine,
    title: "Describe it",
    body: "Type what you are actually about to do, in plain English. One line. The street, the stalls and the errands get built from it.",
    Visual: PromptTyper,
  },
  {
    n: "03",
    icon: Map,
    title: "Walk it",
    body: "Third person, on foot. Walk up to whoever you need and the conversation opens where you are standing.",
    Visual: WasdKeys,
  },
  {
    n: "04",
    icon: Mic,
    title: "Speak it",
    body: "Hold the button and say it out loud. They answer out loud, and you get it written three ways: said, spelled, meant.",
    Visual: MicLevels,
  },
] as const;

export function LandingHowItWorks() {
  const reduceMotion = useReducedMotion();

  // The mini visuals animate only while the section is on screen. Four loops
  // running behind the fold is four timers burning battery for nobody.
  const ref = useRef<HTMLElement>(null);
  const [play, setPlay] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setPlay(Boolean(entry?.isIntersecting)),
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      id="how"
      className="scroll-mt-24 border-t-2 border-border bg-background px-4 py-20 sm:px-6 sm:py-28"
    >
      <div className="mx-auto max-w-[1340px]">
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
          className="flex flex-col gap-4"
        >
          <SectionKicker index="03" label="How it works" />
          <SectionTitle>
            One sentence to a street,
            <br />
            in four moves
          </SectionTitle>
        </motion.div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <motion.article
              key={s.n}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.55, delay: i * 0.08, ease: EASE_OUT }}
              className="overflow-hidden rounded-base border-2 border-border bg-secondary-background shadow-shadow"
            >
              <div className="h-32 border-b-2 border-border bg-background">
                <s.Visual play={play} />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <span className="flex size-8 items-center justify-center rounded-base border-2 border-border bg-main text-main-foreground shadow-[2px_2px_0_0_var(--border)]">
                    <s.icon size={15} strokeWidth={2.5} />
                  </span>
                  <span className="text-2xl font-extrabold tracking-tight text-foreground/15">
                    {s.n}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-extrabold uppercase tracking-tight">
                  {s.title}
                </h3>
                <p className="mt-1.5 text-[13px] font-semibold leading-relaxed text-foreground/65">
                  {s.body}
                </p>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
