import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Static assets must be excluded, not merely because the auth round-trip is
  // wasted on them, but because a redirect to /login serves them HTML. The
  // Indic sign fonts were coming back as the login page, which the loader
  // rejects ("invalid sfntVersion"), and every shop board in the world then
  // painted in a fallback face that has no Telugu glyphs at all.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|models/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf|glb|gltf|mp3|ogg|wav)$).*)",
  ],
};
