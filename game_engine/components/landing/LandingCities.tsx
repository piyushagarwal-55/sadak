"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE_OUT, ENTER, SectionKicker, SectionTitle } from "./LandingHero";

/**
 * The ten districts, same covers the city picker uses.
 *
 * Extensions differ per city because they were drawn at different times, so the
 * filename is written out rather than templated — a clever `${slug}.jpg` would
 * 404 on half of them.
 */
const CITIES = [
  { city: "Old Delhi", street: "Purani Sadak", lang: "Hindi", native: "हिन्दी", img: "/covers/purani-sadak.png" },
  { city: "Hyderabad", street: "Charminar Lane", lang: "Telugu", native: "తెలుగు", img: "/covers/charminar-lane.jpg" },
  { city: "Chennai", street: "Marina Nagar", lang: "Tamil", native: "தமிழ்", img: "/covers/marina-nagar.png" },
  { city: "Mumbai", street: "Dadar Chowk", lang: "Marathi", native: "मराठी", img: "/covers/dadar-chowk.jpg" },
  { city: "Kolkata", street: "Park Gully", lang: "Bengali", native: "বাংলা", img: "/covers/park-gully.png" },
  { city: "Amritsar", street: "Hall Bazaar", lang: "Punjabi", native: "ਪੰਜਾਬੀ", img: "/covers/hall-bazaar.jpg" },
  { city: "Bhubaneswar", street: "Lingaraj Lane", lang: "Odia", native: "ଓଡ଼ିଆ", img: "/covers/lingaraj-lane.jpg" },
] as const;

/**
 * `#cities` — an expanding-panel wall.
 *
 * Idle panels sit narrow and the hovered one takes the room, which is what makes
 * a row of stills feel like somewhere you could go rather than a gallery. The
 * swing is on `flex-grow` rather than width because flex children reflow
 * together, so the others give up their space in the same frame.
 *
 * Seven of the ten, not all ten: at ten the idle panels are too narrow to read
 * and the whole row turns into stripes. The remaining three are one click away.
 */
export function LandingCities() {
  const reduceMotion = useReducedMotion();

  return (
    <section
      id="cities"
      className="relative scroll-mt-24 border-t-2 border-border bg-background px-4 py-20 sm:px-6 sm:py-28"
    >
      <div className="mx-auto max-w-[1340px]">
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
          className="flex flex-col gap-4"
        >
          <SectionKicker index="01" label="Cities" />
          <SectionTitle>
            Ten cities.
            <br />
            Ten languages
          </SectionTitle>
          <p className="max-w-xl text-sm font-semibold leading-relaxed text-foreground/70 sm:text-base">
            You are not picking a difficulty setting. You are picking a place, and
            the place decides what you get spoken to in.
          </p>
        </motion.div>

        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, delay: 0.1, ease: EASE_OUT }}
          className="mt-10 flex flex-col gap-3 sm:h-[440px] sm:flex-row sm:gap-2.5"
        >
          {CITIES.map((c) => (
            <Link
              key={c.street}
              href={ENTER}
              className={cn(
                "group relative overflow-hidden rounded-base border-2 border-border shadow-shadow outline-none",
                "h-56 sm:h-full",
                "sm:flex-[1] sm:transition-[flex-grow] sm:duration-500 sm:ease-[cubic-bezier(0.16,1,0.3,1)]",
                "sm:hover:flex-[3.4] sm:focus-visible:flex-[3.4]",
                "motion-reduce:transition-none"
              )}
            >
              <Image
                src={c.img}
                alt={`${c.street}, ${c.city}`}
                fill
                sizes="(max-width: 639px) 100vw, 40vw"
                className="object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transform-none"
              />
              <span
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent"
              />
              <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-4 sm:p-5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
                  <MapPin size={12} className="text-main" />
                  {c.street}
                </span>
                {/* The native script is the point, so it stays at full size and
                    reveals with the panel rather than shrinking into a caption. */}
                <span
                  lang={c.lang.toLowerCase().slice(0, 2)}
                  className="font-indic text-xl font-heading leading-tight text-main opacity-100 sm:opacity-0 sm:transition-opacity sm:delay-100 sm:duration-500 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100"
                >
                  {c.native}
                </span>
                <span className="max-w-sm text-lg font-bold leading-tight text-white opacity-100 sm:opacity-0 sm:transition-opacity sm:delay-100 sm:duration-500 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
                  {c.city} speaks {c.lang}
                </span>
                <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-main opacity-100 sm:opacity-0 sm:transition-opacity sm:delay-150 sm:duration-500 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
                  Walk it <ArrowRight size={13} />
                </span>
              </span>
            </Link>
          ))}
        </motion.div>

        <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.22em] text-foreground/45">
          + Bengaluru · Kochi · Ahmedabad — ten in all
        </p>
      </div>
    </section>
  );
}
