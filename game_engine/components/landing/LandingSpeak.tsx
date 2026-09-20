"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EASE_OUT, ENTER, SectionKicker, SectionTitle } from "./LandingHero";

/**
 * `#speak` — the dialogue card, sat still on the page.
 *
 * This is the one screen that explains the product, and until now you had to
 * sign in and walk to a stall to see it. So it is reproduced here as markup:
 * what she said, how to say it, what it means, and the line you could give back.
 *
 * Deliberately not a screenshot. The Telugu is real text in the real font, so it
 * stays sharp, it is selectable, and a screen reader can reach it.
 */
export function LandingSpeak() {
  const reduceMotion = useReducedMotion();
  const rise = (delay: number) => ({
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-80px" },
    transition: { duration: 0.6, delay, ease: EASE_OUT },
  });

  return (
    <section
      id="speak"
      className="scroll-mt-24 border-t-2 border-border bg-secondary-background px-4 py-20 sm:px-6 sm:py-28"
    >
      <div className="mx-auto grid max-w-[1340px] gap-12 lg:grid-cols-2 lg:items-center">
        <motion.div {...rise(0)} className="flex flex-col gap-4">
          <SectionKicker index="02" label="Speak" />
          <SectionTitle>
            Say it out loud,
            <br />
            or you don&apos;t get served
          </SectionTitle>
          <p className="max-w-xl text-sm font-semibold leading-relaxed text-foreground/70 sm:text-base">
            Hold the button and speak. She answers out loud, in Telugu, and then
            you get her line written down three ways — so the sentence you just
            failed to catch is one you can read, say, and use again.
          </p>
          <p className="max-w-xl text-sm font-semibold leading-relaxed text-foreground/70 sm:text-base">
            There is no English fallback inside the world. No button for a
            translation, no shopkeeper who switches for you.
          </p>
          <div className="mt-2">
            <Button asChild size="lg">
              <Link href={ENTER}>
                Try it as a guest
                <ArrowRight size={15} />
              </Link>
            </Button>
          </div>
        </motion.div>

        <motion.div {...rise(0.12)}>
          <div className="rounded-base border-2 border-border bg-main p-5 text-main-foreground shadow-shadow sm:p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-main-foreground/60">
              Lakshmi · vegetable seller
            </p>

            <p className="mt-4 font-indic text-2xl leading-snug" lang="te">
              రండి రండి! టమాటా తాజాగా ఉంది.
            </p>
            <p className="mt-1.5 text-sm italic text-main-foreground/75">
              Randi randi! Tamaataa taajaagaa undi.
            </p>
            <p className="mt-1 text-sm font-semibold">
              Come, come! The tomatoes are fresh.
            </p>

            <div className="mt-6 rounded-base border-2 border-border bg-secondary-background p-4 text-foreground shadow-[3px_3px_0_0_var(--border)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-foreground/50">
                Say this back
              </p>
              <p className="mt-2 font-indic text-xl leading-snug" lang="te">
                కిలో ఎంత?
              </p>
              <p className="text-sm italic text-foreground/70">kilo entha?</p>
              <p className="text-sm font-semibold">how much a kilo?</p>
            </div>

            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.22em] text-main-foreground/60">
              she asks ₹40 · see if she comes down
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
