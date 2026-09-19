import type { Metadata } from "next";
import PlayWorld from "@/components/play/PlayWorld";

export const metadata: Metadata = {
  title: "Play — SADAK",
  description: "Walk a situation.",
};

/**
 * `PlayWorld` is a client component that imports the world engine lazily inside
 * its effect, so nothing that touches a canvas runs during the server render.
 */
export default function PlayPage() {
  return <PlayWorld />;
}
