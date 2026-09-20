"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EASE_OUT, ENTER, LandingHero } from "./LandingHero";
import { LandingCities } from "./LandingCities";
import { LandingSpeak } from "./LandingSpeak";
import { LandingHowItWorks } from "./LandingHowItWorks";

/**
 * THE PUBLIC FRONT DOOR.
 *
 * Everything else in this app sits behind a session. Before this page existed a
 * stranger opening the link got a sign-in form and had to decide whether the
 * product was worth an account without ever having seen it. That is a bad trade
 * to offer anybody and a worse one to offer a judge with fifty tabs open.
 *
 * So: the street, the ten cities, what a conversation looks like, how it goes,
 * and a way in that costs nothing. Every call to action lands on `/login`,
 * where the first button is "Continue as guest".
 */
export default function Landing() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <LandingNav />
      <LandingHero />
      <LandingCities />
      <LandingSpeak />
      <LandingHowItWorks />
      <LandingClose />
      <LandingFooter />
    </div>
  );
}

/** Fixed, transparent over the hero, so the wordmark is always a way home. */
function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <nav className="mx-auto flex max-w-[1340px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-base border-2 border-border bg-secondary-background px-3 py-1.5 shadow-shadow"
        >
          <span className="font-indic text-sm font-heading leading-none" lang="hi">
            सड़क
          </span>
          <span className="text-sm font-extrabold uppercase tracking-tight leading-none">
            Sadak
          </span>
        </Link>
        <Button asChild size="sm">
          <Link href={ENTER}>Enter the street</Link>
        </Button>
      </nav>
    </header>
  );
}

/**
 * The last screen. One instruction, and a ghost of the wordmark behind it so the
 * page ends on something rather than trailing off into a footer.
 */
function LandingClose() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden border-t-2 border-border bg-secondary-background px-4 py-24 sm:px-6 sm:py-32">
      {/* Watermark. aria-hidden and non-selectable — it is texture, not text. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 select-none text-center text-[clamp(90px,22vw,300px)] font-extrabold uppercase leading-[0.75] tracking-[-0.05em] text-foreground/5"
      >
        Sadak
      </span>

      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.65, ease: EASE_OUT }}
        className="relative mx-auto flex max-w-[1340px] flex-col items-center gap-6 text-center"
      >
        <h2 className="text-[clamp(44px,9vw,110px)] font-extrabold uppercase leading-[0.85] tracking-[-0.04em]">
          Walk in<span className="text-main">.</span>
        </h2>
        <p className="max-w-md text-sm font-semibold leading-relaxed text-foreground/65 sm:text-base">
          No sign-up. Continue as a guest and you are on the street in one click —
          go and fail at buying tomatoes, which is better here than at the stall.
        </p>
        <Button asChild size="lg">
          <Link href={ENTER}>
            Continue as guest
            <ArrowRight size={15} />
          </Link>
        </Button>
      </motion.div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t-2 border-border bg-background px-4 py-8 sm:px-6">
      <div className="mx-auto flex max-w-[1340px] flex-col gap-3 text-[10px] font-bold uppercase tracking-[0.22em] text-foreground/45 sm:flex-row sm:items-center sm:justify-between">
        <p>Ten cities · ten languages · your voice</p>
        <p>Deployed on AWS</p>
        <div className="flex gap-5">
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-foreground">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
