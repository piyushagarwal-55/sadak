"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shared entrance curve for every landing section. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Where every call to action on this page goes. */
export const ENTER = "/login";

/**
 * The first screen.
 *
 * A still of the actual street, full bleed and darkened, with the wordmark sat
 * on the bottom of the viewport. The point is that the first thing a stranger
 * sees is the thing itself — not an illustration of it, and not a form.
 *
 * The scrim is doing real work: these stills are bright, the type is white, and
 * without a gradient the headline disappears over the awnings.
 */
export function LandingHero() {
  const reduceMotion = useReducedMotion();

  const reveal = (y: number, x: number) =>
    reduceMotion
      ? { initial: { opacity: 0 }, whileInView: { opacity: 1 } }
      : { initial: { opacity: 0, y, x }, whileInView: { opacity: 1, y: 0, x: 0 } };

  return (
    <section className="relative min-h-dvh overflow-hidden bg-background">
      {/* Full-bleed street. Darkened hard — the type has to win. */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/cutscenes/barber/charminar-lane.png"
          alt=""
          aria-hidden
          fill
          priority
          className="object-cover"
          style={{ filter: "saturate(0.8) brightness(0.45)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.85) 100%)",
          }}
        />
      </div>

      <main className="relative z-10 mx-auto flex min-h-dvh max-w-[1340px] flex-col justify-end gap-8 px-4 pb-12 pt-28 sm:px-6 sm:pb-16">
        {/* Event chip */}
        <motion.p
          {...reveal(20, 0)}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          className="flex w-fit items-center gap-2.5 rounded-base border-2 border-border bg-secondary-background/90 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-foreground shadow-shadow backdrop-blur-sm"
        >
          <span
            aria-hidden
            className="size-[7px] shrink-0 animate-pulse rounded-full bg-main shadow-[0_0_10px_2px_var(--main)] motion-reduce:animate-none"
          />
          Ten Indian languages · spoken, not typed
        </motion.p>

        <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-end sm:gap-12">
          {/* Wordmark */}
          <motion.div
            {...reveal(60, 0)}
            viewport={{ once: true }}
            transition={{ duration: 0.9, ease: EASE_OUT }}
            className="min-w-0"
          >
            <p className="font-indic text-2xl font-heading text-main sm:text-3xl" lang="hi">
              सड़क
            </p>
            <h1 className="mt-1 text-[clamp(64px,10vw,156px)] font-extrabold uppercase leading-[0.82] tracking-[-0.045em] text-white">
              Sadak<span className="text-main">.</span>
            </h1>
            <p className="mt-4 text-base font-bold text-white/80 sm:text-lg">
              Learn the street, not the syllabus.
            </p>
          </motion.div>

          {/* Pitch + CTA */}
          <motion.div
            {...reveal(0, 60)}
            viewport={{ once: true }}
            transition={{ duration: 0.9, delay: 0.1, ease: EASE_OUT }}
            className="w-full max-w-[420px] shrink-0"
          >
            <p className="text-sm font-semibold leading-relaxed text-white/70">
              A third-person Indian street you walk through and talk your way
              across. Every shopkeeper, conductor and passer-by speaks the
              language of their city — and nothing else.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href={ENTER}>
                  Continue as guest
                  <ArrowRight size={15} />
                </Link>
              </Button>
            </div>

            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">
              no account · hold to speak · ten cities
            </p>
          </motion.div>
        </div>
      </main>

      {/* Scroll cue */}
      <button
        type="button"
        onClick={() =>
          document.getElementById("cities")?.scrollIntoView({
            behavior: reduceMotion ? "auto" : "smooth",
            block: "start",
          })
        }
        aria-label="Explore"
        className="absolute bottom-4 left-1/2 z-20 hidden -translate-x-1/2 flex-col items-center gap-1 text-white/50 transition-colors hover:text-white sm:flex"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.28em]">Explore</span>
        <ChevronDown size={16} className="animate-bounce motion-reduce:animate-none" />
      </button>
    </section>
  );
}

/** Section label shared by every band below the hero: `01 CITIES`. */
export function SectionKicker({ index, label }: { index: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-foreground/50">
      <span className="text-main">{index}</span>
      {label}
    </span>
  );
}

/** The big uppercase headline, with the amber full stop Pounce-style. */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="max-w-3xl text-[clamp(32px,5vw,64px)] font-extrabold uppercase leading-[0.9] tracking-[-0.03em] text-foreground">
      {children}
      <span className="text-main">.</span>
    </h2>
  );
}
