# Research: generating situation worlds for SADAK

Date: 2026-09-17. Audience: project owner. Status: decision-ready, not yet decided.

This document exists because two build attempts were rejected in two days and you asked for the thinking to happen before the third. It is built from five code-reading reports (the shipped SADAK game, the ported ShopVerse JS engine, the dormant ShopVerse TypeScript engine, the uncommitted sim layer, the voice stack), five research digests (academic LLM scene generation, game-industry modular design, web-3D feasibility, product and UX comparables), three competing proposals, three judges, three adversarial refuters and one critic. Where the refuters found the synthesised design wrong, the design has been changed; where a point could not be settled without you or without a measurement, it is listed as an open question or a Day-1 test. Nothing in here is a sales pitch. Several numbers you have been told in the last two days were wrong and are corrected below.

Sections 1 to 3 are the diagnosis and the evidence. Section 4 is the design. Sections 5 to 7 are the plan, the demo and the decisions only you can make. The appendix holds the refutations and the sources.

---

## 1. Why we were not converging

The two rejected builds sit at opposite ends of one split, and both violated it. Every strong result in the literature and every production pipeline surveyed lands on the same division of labour: humans author a small number of high-quality places with typed slots and a walkable skeleton; a deterministic builder fills the slots from a closed catalogue; the language model supplies only what a builder cannot (which place, what it is called, who is there, what they know and want, what success means, what everyone says). The first attempt let code invent places from 106 atomic boxes with a layout solver. That is the ProcTHOR/Holodeck floor with none of their assets, compound groups or density, and the field's own results at that granularity look like boxes on a slab: Holodeck's most-cited flaw is under-population, LayoutGPT puts 43-83 percent of objects out of bounds, and even fine-tuned 8B layout models keep a 0.26 overlap rate. The second attempt let nothing structural vary. `lib/sim/world/dressing.ts` forces every situation into ShopVerse's four fixed shopfront slots keyed `sole/fashion/electronics/cafe`, so a railway station opens into a shoe shop, and the square cannot become a platform or a clinic corridor by renaming boards. The reader's line is exact: the fixed slot mapping "is the structural reason 'this is still not it'".

We built plumbing before the frame you would judge. Two days of uncommitted work produced two parallel rendering pipelines (solver plus `render.ts` plus `WorldStudio.tsx` plus `/api/sim/world`, and dressing plus `ScenarioWorld.tsx` plus `/api/sim/scenario`), each with its own selection, UI, route and fallback list, and zero of the pieces that make an NPC read from world state: no context engine renders facts into a prompt, no extractor produces mutations, no grader exists, no route persists a `WorldState`. The genuinely valuable core, `lib/sim/schema.ts` and `lib/sim/state.ts`, is imported by exactly one file, `scripts/sim-smoke.ts`. Comments in `schema.ts` describe a Postgres-backed authoritative copy and `agent.py` reading `/api/sim/*`; neither exists. Both talk panels literally say "Voice is not wired in yet".

There was no visual checkpoint. Both attempts ran for a day or more before you saw a frame. The failure was not code quality (`layout.ts` is competent, deterministic and tested) but building the wrong thing well. The schedule in Section 5 is ordered by this: a walkable Indian lane on Day 1, a dressed lane and a screenshot review with you on Day 2, a living lane on Day 3, and only then a model call.

There was no shared definition of "different" or "alive". "Different" meant different geometry in attempt one and a different palette in attempt two; neither is what a judge sees from a third-person camera. "Alive" was never defined at all, and the shipped SADAK game has no pedestrian crowd, only vehicles on a torus. This document fixes both: different means a different archetype, or a visibly different frontage, overhead cover and ground surface plus different fills, signage and cast, measured on a screenshot, not on a JSON diff; alive means motion, purpose and consequence you can see before anyone speaks.

The conversation side never existed on the live path, which the rendering argument hid. The shipped `components/Dialogue.tsx` is a repeat-after-me drill graded by word alignment. `/api/talk`, `/api/task-talk`, `/api/errand`, `/api/voice/token` and `lib/useLiveVoice.ts` have zero callers. The LiveKit worker freezes its brief at join and cannot see Groq or the state engine. So "talk to an NPC about a situation" is unbuilt regardless of how the world is drawn, and it is the half of the product that carries the principle you stated.

Two facts about the stack were also wrong in everyone's head. Only `qwen/qwen3.8-27b` is unblocked on the Groq org, and `lib/sim/groq.ts` defaults `max_tokens` to 512, so any world spec sent through the current wrapper would have been truncated on its first call.

---

## 2. What actually exists and its quality

### 2.1 The shipped SADAK game (`game_engine/lib/game`, `components/Game.tsx`)

The world-rendering stack is the strongest code in the repository and should be kept wholesale: merged-geometry terraces with recessed windows, balconies, shopfronts and Indian details by `archStyle` (`buildings.ts`, `arch-details.ts`), a 12-surface procedural PBR material library with Sobel normals (`materials.ts`, `mat/*`), instanced clutter with ~28 prop types at one draw call each (`clutter.ts`), extruded cars with clearcoat (`vehicles.ts`), rigged low-poly people with idle/walk/run blending and saree, lungi, turban and uniform presets (`people.ts`), ~30 code-built hero landmarks including Charminar, Gopuram, BazaarGate, JalebiStall, TiffinCart (`assets/*`), and a bloom/grade/haze/SMAA post pipeline. The Sarvam plumbing (`lib/sarvam.ts`, `useVoice.ts`, `/api/stt`, `/api/speak`) is production quality and encodes hard-won fixes (reasoning_effort null, json_object not json_schema, phrasebook-as-worked-examples placed last, a Unicode script backstop with one retry, TTS decoupled from text). The `task-conversation.ts` grading contract (three checks, `english_fallback`, `outcome_achieved`, hint) is the right evaluation shape.

Its limits for the target product are structural. The city is one layout: `GRID`, `BLOCK`, seed `20260730` and `CHOWK` are module constants and `addLandmarks` is a ten-case switch with hand-tuned coordinates, so a new `Theme` cannot produce a new place. Kinds (`auto|shop|temple|bus`) are hard-coded across `engine.ts`, `Hud.tsx` and `tasks.ts`. Nothing on the live path talks to an LLM except `/api/recall`.

| Keep (path) | Why |
|---|---|
| `lib/game/buildings.ts`, `arch-details.ts`, `materials.ts`, `mat/*` | Shells and surfaces for any archetype |
| `lib/game/clutter.ts` (prop builders, one-InstancedMesh pattern) | Filler layer |
| `lib/game/people.ts`, `vehicles.ts`, `props.ts` (makeAuto, makeStall, makeStreetLight, makeTrafficLight, makeTree, mulberry32) | Bodies, traffic, props |
| `lib/game/assets/*` (heroes, stalls, carts, rickshaws, flag) | Set dressing by tag |
| `lib/game/districts.ts`, `districts-six.ts` (Theme, language, script, phrases only), `fx/presets.ts` | City packs |
| `lib/game/prompt.ts` (scriptBlock, looksLikeTargetScript, memoryBlock), `task-conversation.ts` (checks contract), `speech-score.ts`, `npc-memory.ts`, `load-district.ts` pattern | Prompting and grading |
| `lib/sarvam.ts`, `lib/useVoice.ts`, `lib/retry.ts`, `app/api/stt`, `app/api/speak` (generalised), `app/api/recall` (pattern) | Voice |
| `components/Hud.tsx` (minimap, badges), `Dialogue.tsx` (mic chrome), `Game.tsx` (city picker chrome, joystick) | UI chrome |

| Delete or park (path) | Why |
|---|---|
| `app/api/talk`, `app/api/task-talk`, `app/api/errand`, `lib/game/errands.ts` | No callers; copy the grading prompt text first |
| `lib/useLiveVoice.ts`, `app/api/voice/token`, `agent.py`, `livekit.toml`, root `requirements.txt`, `Dockerfile` | Park (git keeps it); brief frozen at join, no Groq, no state engine access |
| `judge.py`, `token_server.py` | Dead |
| `lib/game/props.ts` facadeTexture/makeBuilding/makeArch; `assets/shared.ts` legacy makePerson; `getDistrictKit().vehicles/.streetProps` | Superseded, never called |
| `lib/game/clutter-preview.mjs`, `people-preview.mjs`, `people-preview.png`, `assets/preview.mjs`, `assets/preview-*.png` | 1.3 MB of harness output in lib/ |
| `lib/game/leaderboard.ts`; `districts*.ts` `npcs[]`, `premise`, `finale` | Types only; story content read by dead routes |
| README gameplay sections (wanted level, BUSTED, clue journal, LiveKit default); `docs/HANDOVER.md` integration section | Stale; keep the latency tables |

The shipped game itself (`city.ts`, `engine.ts`, `tasks*.ts`, `street-task-lessons/`, `barber*.ts`, `Game.tsx`, `Dialogue.tsx`) is not deleted. It stays at its routes and is simply not on the product path. Whether to hide it during judging is an open question (Section 7).

### 2.2 The ported ShopVerse JS engine (`game_engine/lib/sim/engine`)

Verdict: the substrate is excellent and the one authored square is a recipe, not a system. `core/Renderer.js` (ACES, PMREM IBL, half-res bloom, a frame-time QualityGuard), `kit/sky.js` (shader dome with sun, haze, stars, drifting clouds), `core/util.js` (`pbrCanvas`, `mulberry32`, `mergeSafe`), ~45 heavily instanced prop builders across `kit/{street,nature,seating,water,forms,materials}`, and four attachable life systems (`Traffic.js` with lights and yield-to-player, `Social.js` speech-bubble pairing, `Activities.js` seated groups and a ball game, `critters.js` pigeons and squirrels that react to you) are why it looks rich and runs. `world/LegacyZones.js` is exactly the "reality the LLM cannot override" primitive: a declarative surface map with rules, sliding resolve and `nearestLegal`. `BaseWorld.js` is the contract a generated world must satisfy, with a 18/44 m NPC LOD. `host/SimHost.js` has a tuned camera rig that is most of why walking feels good.

`worlds/Outdoor.js` (1,332 lines) is hand-authored: 143 hex literals, 77 coordinate tuples, the same road geometry typed in four places, SOLE/POUNCE branding baked into billboards and storefronts, English ShopVerse dialogue pools. It should be mined for its composition rules (lit glass in every bay, a bulb net over the whole square, planting, water, a 30-string light net) and not parameterised further. Interiors are separate scenes with fake doors; the shoe shop throws every frame under SimHost. Roughly 40 percent of the code is shopping residue. The kit is Western-generic: no auto, thela, chai stall, hoarding, cow or tarpaulin.

| Keep (path) | Delete (path) |
|---|---|
| `core/Renderer.js`, `util.js`, `Input.js`, `design.js` (minus PALETTE.sole) | `data/shoes.js`, `staff.js`, `products.js` |
| `world/BaseWorld.js`, `LegacyZones.js`, `NPC.js`, `Employee.js` (minus POUNCE uniform), `Player.js`, `HeroAvatar.js`, `character/**` | `systems/ShoppingSession.js`, `Campus.js`, `Mirror.js` |
| `world/Avatar.js` (minus giveBag/applyOutfit) pending the Day-1 body test | `worlds/ShoeShop.js`, `SoleFlagship.js`, `ElectronicsShop.js` |
| `kit/street.js`, `nature.js` (minus snowRange), `seating.js`, `water.js`, `forms.js`, `materials.js`, `critters.js`, `retail.js` (plinth, vitrine, counter) | `kit/retail.js` shoeWall; `builders.js` arWall/cashierDesk/shelf/displayTable |
| `systems/Traffic.js`, `Social.js` (minus EXCHANGES), `Activities.js`; `data/people.js` | `worlds/CafeShop.js` after lifting cafeTable/chair/stool/menuBoard into kit |
| `host/SimHost.js` (camera, loop, interactables; replace WORLD_CLASSES with `mount(world)`) | `worlds/chowkSpec.js` after folding skyFromTheme/actorPositions into city packs |
| `worlds/Outdoor.js` as a read-only recipe | `Outdoor.js` from the runtime path (see Section 4 on why it is not de-branded) |

### 2.3 The dormant ShopVerse TypeScript engine (`teampounce-mine/shopverse/src/world`)

Verdict: not usable as a world generator, and not worth porting. It is 14,809 lines (not 43k) of a clean plugin harness plus six families of which only atmosphere and weather draw anything (sky dome, sun, clouds, rain). Buildings, zones and terrain are explicitly documented as "pure data, never touches Three.js" and live up to it: `BuildingLoader` hard-codes one coordinate-free "Pounce Mall", `StoreLayouts.generateDefault` emits a style enum and two random points, `ZoneLoader` slices the world into a uniform 5x4 grid of AABBs. The only mesh-producing family has every `registerX` call commented out and its placeholder box props are visibly worse than `kit/*.js`. There is no ingress for a described situation anywhere; every JSON hook is a stub. The 197 `@status IMPLEMENTED` stamps describe intent. Turning it on would reintroduce exactly the "boxes on a slab" look. Nothing from it enters this repo.

### 2.4 The sim layer (`game_engine/lib/sim`, uncommitted)

Verdict: one excellent stratum wired to nothing, and two rendering strata of which both are superseded. `schema.ts` and `state.ts` are a clean, pure implementation of your principle: immutable `Scenario`, facts with `visibility` and `mutable`, a mission goal graph gated by preconditions, `applyMutations` that rejects locked facts loudly and settles the graph to a fixed point, an append-only log. `groq.ts` carries measured, dated account constraints that would otherwise be rediscovered painfully. `catalog.ts`'s "selection not generation" keyword pre-filter and `cities.ts`'s city picker are correct and small. The eight venue libraries carry useful metadata (Hinglish keywords, zone labels, character role hints with Bulbul speakers) entangled with 106 rejected `build()` functions.

One thing the readers found that changes the design: `state.ts` `settle()` only promotes missions `locked -> active`; `active -> complete` happens only through an explicit mission mutation. There is no path from facts to completion. The design in Section 4 adds one (`completeWhen`), which means the "state.ts unchanged" claim in every proposal was false.

| Keep (path) | Delete (path) |
|---|---|
| `lib/sim/schema.ts`, `state.ts` (with `completeWhen`/`failWhen` added), `groq.ts` (with explicit maxTokens per call) | `lib/sim/world/layout.ts`, `render.ts`, `component.ts` (after moving metadata types) |
| `lib/sim/scenarios/jaipur-date.ts`, `scripts/sim-smoke.ts` | `lib/sim/world/libraries/common.ts` and every `build()`/footprint in `libraries/*.ts` (after extracting keywords, zones, character hints to `lib/sim/archetypes/meta/*.json`) |
| `lib/sim/world/cities.ts`; `catalog.ts` keyword scorer (to `lib/sim/compile/classify.ts`) | `lib/sim/world/dressing.ts`; `components/sim/WorldStudio.tsx`, `WalkableWorld.tsx`; `app/world/page.tsx`; `app/api/sim/world`, `app/api/sim/scenario` |
| `components/sim/ScenarioWorld.tsx` scaffold (to `components/play/PlayWorld.tsx`); `scripts/dressing-smoke.ts` pattern | `scripts/layout-smoke.ts`, `world-smoke.ts` (keyword block moves to compile-smoke) |

### 2.5 The voice stack

Verdict: production-quality speech in and out, with two conversation architectures neither of which is wired. The REST path (`/api/stt -> /api/talk -> /api/speak`) has all its Sarvam quirks handled and its grading contracts written; the LiveKit path (`useLiveVoice -> /api/voice/token -> agent.py`) has a frozen brief, one room per NPC, its own Sarvam LLM and no Groq client. Every route resolves NPCs by `districtId + npcId` from Supabase rows, so a generated NPC 404s in `/api/speak`, `/api/talk` and the token route before any prompt is built. `/api/speak` only reads the Supabase Storage TTS cache; it never writes (the header says so), and `.env.example` exposes only the publishable key. Four incompatible grading shapes exist. `speech-score.ts` is word-level Levenshtein against an STT transcript, which is recognisability, not pronunciation; the debrief must label it that way.

The recommendation is to build the product on the REST push-to-talk loop, generalise `/api/speak` to accept `{text, language, speaker}`, and park LiveKit. The reason is technical, not taste: the Python worker cannot read the TS state engine per turn without a new adapter, and reviving it adds nothing visible in three minutes. It can later be repointed to POST each user turn to `/api/sim/turn`, inheriting state and Groq without a Python LLM adapter.

---

## 3. What the field knows

### 3.1 Text to 3D scene generation (about 30 systems, 2022-2026)

One architecture wins consistently. The LLM decides what: an object list from a catalogue, counts, anchors, coarse relations, roles, purpose. A deterministic solver decides where, with hard no-collision and in-bounds constraints. A verifier closes the loop, and the physical checks are always deterministic (collision pairs, out-of-bounds, A* reachability) while only semantic checks use a model. Every method that lets the LLM emit raw coordinates zero-shot reports high failure (LayoutGPT 43-83 percent out of bounds even with GPT-4) or needs fine-tuning on 10k+ layouts (LLplace, OptiScene, LayoutVLM) or human correction (Roblox Cube). Dense relation sets provably self-contradict; the fix is hierarchy (area, anchor, dependents) with a few relations only to anchors.

Visual quality never comes from the LLM or the solver. It comes from a curated, size-annotated, style-consistent asset library (Imaginarium's 2,037 professional models), authored compound groups placed as units (ProcTHOR's table-plus-chairs gets 800k combinations from one group), and density (the best systems place 30-70 objects per room; under-population is Holodeck's most-cited flaw). Placement is hierarchical: architecture and zones, then large anchors, then dependents, then wall objects, then small props scattered onto receptacle surfaces, then a navigability check. MarketGen, the closest analogue to a bazaar, has the LLM parameterise a space partition and pick parametric shelf attributes, curates 1,100 goods assets by hand, and guarantees paths with A*. City systems never let the LLM place buildings; open-source models hit 9-78 percent executability on that task versus GPT-4's 91. On-the-fly asset generation costs about an hour per scene. LLM plus wave-function-collapse is essentially unexplored and WFC alone yields structureless output unless a coarse hand pass sets large-scale structure first.

### 3.2 How games look rich from finite assets

Games combine a small number of hand-authored space archetypes with parametric slots (Hades picks rooms from a fixed hand-built bucket per biome; Gungeon uses 4-8 authored flow graphs and ~300 handcrafted rooms), a modular kit built in strict order (utilitarian core, then variants, then hero, per Bethesda), cheap variation layers that hide kit repetition (Fallout 4's wall kit shipped as eight texture treatments with no geometry change; signage is the single largest category in Synty's 331-asset city pack), a disciplined dressing pass (fractal clusters around one hero per scene, roughly 70 percent quiet to 30 percent accent, nothing on the main path), and an aliveness layer that is mostly idle stations plus a 3-state crowd FSM plus archetype barks plus layered audio, not real AI (Hitman's crowd is idle/walk/pending-walk; Bethesda NPCs "stand still like zombies" wherever idle markers are sparse; GTA V's ambient life is scenario points with time-of-day probabilities). Ubisoft's settlement generator places landmarks first and enforces proximity rules ("no second religious building within 150 m"). Districts read as different places through architectural style, mood, crowd life and a landmark anchor, with real distances shrunk.

Indian streets read as Indian primarily through signboards: big, bright, multi-script, hand-painted, three-dimensional "satrangi" letters in cinema-poster layout, often with an illustration of the trade. After signage come improvised materials (tarpaulin canopies on bamboo, tin sheets, goods on mats and carts, tarps against closed shutters), regulated vehicle colours per city (Mumbai black-yellow, Delhi and Kolkata green-yellow, Chennai light-yellow-black, Bengaluru yellow with green, Hyderabad yellow-black to be verified), and a dense pedestrian layer with recognisable roles. Laad Bazaar specifically is a narrow pedestrian lane off Charminar with no cars, bangle shops whose bright bulbs reflect off glass at night, and Irani chai stalls: a linear lane archetype with a landmark at one end.

### 3.3 What a browser can afford

For an integrated laptop GPU at 1080p the frame should stay around 150-200 draw calls and 0.5-0.8M triangles including the shadow pass, with one directional shadow light at 1024-2048 PCF (not PCFSoft), `shadowMap.autoUpdate=false` for static geometry, bloom at half resolution or off, pixelRatio capped at 1.5-2. The repository's own `Xbot.glb` is 49,112 triangles and 67 joints per body; twenty of them is a million skinned triangles before a single prop. Skinned-mesh cost is CPU-bound (AnimationMixer, bone updates); 200-300 SkinnedMeshes is the 60 fps baseline, ~500 with animation throttled to every fourth frame, ~1000 with shared skeletons. Native `InstancedMesh` culls all instances by one bounding sphere; `@three.ez/instanced-mesh` adds per-instance culling and skinning and is compatible with three 0.172. Shader compilation, not geometry, is the biggest first-frame stall: one real scene went from 3.5 s to 0.85 s by consolidating 30 materials; use `renderer.compileAsync`.

For Indic signage, `troika-three-text` has an open issue (#303, January 2024): Indic shaping rules are not implemented. Devanagari and Telugu must be drawn with Canvas 2D `fillText` (browser HarfBuzz shaping) onto a `CanvasTexture`, after awaiting `document.fonts.load` of a self-hosted Noto Sans font, drawn once and never per frame. Windows (Nirmala UI), macOS (Kohinoor) and Android (Noto) all ship Indic fallbacks. Loading UX: 10 seconds is the attention limit; a percent-done or step counter is mandatory beyond it; users wait about three times longer with a progress bar; for generative waits, users ignore bars but notice what appears, so a streamed reveal is the real cue. Groq serves 27-32B Qwen at roughly 400 tokens per second with 0.7 s to first token; Indic text costs 3-4 tokens per character.

### 3.4 Product and UX comparables

No shipping product in 2025-26 generates an arbitrary high-quality navigable 3D world from a prompt in a browser in seconds. Meta's WorldGen is research-only, takes minutes and caps at 50x50 m; Genie 3 is a video model with 60-second sessions and clunky movement; Roblox Cube generates single objects. The products that ship engaging situation experiences (Duolingo Adventures, Noun Town, Mondly VR) use hand-authored scenes and vary the situation: goal, cast, dialogue, feedback. The successful generative framings do two things worth copying: they show a plan before the world (Project Genie's editable preview image; WorldGen's blockout and navmesh before assets), and they make NPCs feel real through persona persistence, low latency, an objective injected every turn (Convai), state-grounded facts (the trading-NPC paper reaches 97 percent state compliance by naming six interaction states and templating price arithmetic), a scaffolded turn structure with a system-triggered closer (Duolingo Video Call), and diegetic feedback where the character reacts with confusion rather than grading (Duolingo Adventures). Critics panned AI-NPC demos for wooden dialogue, conversations that funnel to fixed outcomes regardless of input, and technical breakdowns; research confirms open-ended LLM NPCs raise cognitive load without improving experience unless scaffolded, and players punish breakdowns far more than prompt philosophy. Hackathon judges reward a clean finished demo that tells one story in three beats, with the most impactful visual in the first sixty seconds.

### 3.5 What nobody read, and should

The research digest is entirely about layout generation and not at all about visual composition. Before Day 2 someone should spend an hour on reference photography of Laad Bazaar at dusk and the Secunderabad concourse as the art target, read the Sarvam docs for Saaras v3's `unknown` language mode and Bulbul v3's per-request cap, read Groq's published rate limits for this org's tier, and look at how many iterations each ShopVerse prop took in the original repository, which is the best predictor of Day-2 feasibility.

### 3.6 Rules for this project

1. The model fills a typed spec from closed enums; it never emits a coordinate, rotation, scale, mesh name or asset id outside the catalogue. Unknown ids fail validation and fall back to archetype defaults.
2. Places are authored. Quality comes from ShopVerse-grade compound groups placed as units, enclosure on every side, density to a band, and a dressing pass in clusters. No solver invents a street.
3. Variety is composition: archetype, then frontage, overhead and ground, then slot fills, then signage in the city script, then city pack, then time and weather, then cast and mission. Signage is the cheapest strong difference and the thing the model is best at.
4. Reality lives in `lib/sim/state.ts`. The model reads a filtered snapshot and proposes named actions; code checks preconditions, does the arithmetic, and `applyMutations` applies or rejects. Mission completion derives from facts, never from a grader in the live loop.
5. Alive is engine-driven and merely scaled by the spec: stations at every stall foot, a 3-state crowd routine, traffic on lanes, critters, barks on jittered cooldowns, one scripted vignette or two, one mid-mission world event.
6. One blocking model call under 600 output tokens, temperature 0.3, explicit `maxTokens`, plus one non-blocking call for native text. Never a chain. Show the plan drawing itself while waiting.
7. Feedback is diegetic in the scene (confusion, slower repeat, in-character refusal) and explicit only in the debrief. Speaking is scaffolded with suggested phrases; typed input is a first-class path, not a fallback.
8. Budget is measured, not asserted: draw calls, triangles, frame time and program count on an overlay from Day 1, crowd count adapted to frame time at runtime.
9. Indic text is drawn with Canvas 2D after the font loads. Never troika for Devanagari or Telugu.
10. Never demo two of the same archetype. Never ship a chip whose world does not exist. Never let a judge see a spinner.

---

## 4. The recommended design

### 4.1 The synthesis and how the judges reasoned

Three proposals were written from three stances: authored-first (three archetypes, 25 groups, two-call compile, a rich vignette catalogue), generation-first (four spine generators and a frontage solver composing compound groups, mandatory enclosure, the widest variety), and demo-first (two archetypes, 14 groups, one compile call, visuals before any model, Day 10 empty). All three converged on the same architecture and differed on scope and sequencing. Two judges picked demo-first for buildability and honesty; one picked authored-first for its demo and its two-call compile. All three said the same thing about the final design: take demo-first's calendar (a walkable lane on Day 1, a dressed lane and a screenshot review on Day 2, alive on Day 3, model on Day 4), authored-first's split of the model output into a small blocking spec and a non-blocking native-text pack, and generation-first's macro enums so an authored recipe can still change shape. None of the judges believed a frontage solver written in one day would produce composition (silhouette rhythm, where the tall thing sits against the sky, the hero reveal), and none believed three archetypes plus 25 groups fit in ten days.

Then three refuters and a critic attacked the synthesised design. Two findings were fatal and both are fixed below. The kit as written wrapped `makeStall`, which is the same flat box counter as the rejected `clothStall`, and dropped every lever that makes ShopVerse pretty (lit glass in every bay, a bulb net, planting, water) while adding two 70 m walls of dead shutters. And mission completion was sourced from a parallel Groq grader racing the engine's arithmetic, which is the LLM controlling reality at the exact moment the demo invites a judge to test it. The rest of the refutations were about schedule (Days 1-3 were each two to three days of work), understated numbers (the spec call is 2,500-3,000 tokens not 900; 26 Avatar bodies alone exceed the 200-draw-call budget; per-turn latency is nearer 6 s than 4), missing subsystems (audio, TTS cache writes, session identity, a camera that survives a 9 m lane), and stakes (nothing can go wrong). The table below is the fold-in.

### 4.2 What the refutations changed

| Finding | Change in this design, or explicit risk |
|---|---|
| Kit fidelity ceiling is the rejected fidelity (R1, fatal) | Six lane groups at hero-asset effort, not fifteen tinted counters; each built around goods heaps under a continuous tarpaulin sheet spanning the lane; variants are goods, not colours. `Outdoor.js` composition rules copied into the lane shell: every ground-floor bay lit glass with an interior silhouette, never a shutter; a bulb net over the whole lane; trees and planters at both ends; one water feature (a tank). |
| A clinic remaps to the bazaar lane, so a judge sees the same lane twice (R1, fatal) | Chips exist only for archetypes that exist: two bazaar variants, two station variants. Free text still remaps but the mapping line is shown before the world builds and the demo never mentions a clinic. |
| Length and gate enums are invisible from a third-person camera with a 44 m cull (R1) | Lane length fixed at ~50 m so hero and density stay in frame. The macro axes are the ones visible at eye height: frontage `one_side/two_sides`, overhead `sky/tarp/tin`, ground `mud/kota/asphalt`. Variety is checked on a downsampled screenshot from the spawn camera, not only on a JSON diff. |
| Which crowd body, and how many (R1 vs R2, unresolved) | Measured on Day 1: 20 `Avatar.js` bodies vs 20 `people.ts` bodies in one scene, `renderer.info` and a side-by-side screenshot; you choose. Crowd count is adapted to frame time at runtime (Section 4.10). |
| Charminar authored at ~13 m is occluded behind 10.6 m shells (R1) | Day-1 camera test; scale 2x with a gap outside the shell line, or place beside the gate at the lane mouth. |
| Days 1-3 each 2.5-3x over-committed; `Outdoor.js` de-brand still imports `data/shoes.js` (R2, fatal on schedule) | Re-sequenced (Section 5). The chowk is not de-branded; the lane shell is the floor from Day 1. Kit frozen at 6 lane groups plus 3 station groups and ~10 fillers. Day-0 checklist added. |
| Spec call is 2,500-3,000 tokens, `groq.ts` truncates at 512 (R2, R3) | Blocking call is a skeleton under 600 tokens: enums, slot triples, cast as role plus name-from-list plus one quirk, mission templates, prices, wallet. Code derives facts, `MissionNode`s, personas and key phrases from templates. Explicit `maxTokens` per call, temperature 0.3. Personas, wants and all native text move to the non-blocking VoicePack. |
| 700-900 draw calls, not 200; 60 fps on iGPU not credible (R2) | Honest budget measured on the demo laptop on Day 1 and written into the overlay; kit groups merged by material at build (2-3 draws each); crowd casts no shadows; `castShadow` for nearest six; adaptive crowd cap. The pitch says "60 fps on the demo laptop", not "on an iGPU". |
| Per-turn audio at ~6 s, not 4 (R2) | Turn output is `actions` first, then `reply.native` and `reply.roman` only (English gloss on tap, lazily). Groq response is streamed; Bulbul fires the instant `reply.native` closes and all actions passed. No grader in the live loop. Target measured Day 6 and written into the demo script. |
| Mission completion is LLM-graded (R3, fatal) | `MissionNode` gains `completeWhen: Condition[]` and `failWhen: Condition[]`; `settle()` promotes `active -> complete/failed` from facts (about 15 lines in `state.ts`, `SCENARIO_VERSION` bump). Missions come from typed templates (`buy`, `ask`, `get_ticket`) expanded in code. The checks-contract LLM runs only in the debrief. |
| Reply spoken even when its action is rejected (R3) | JSON key order puts `actions` before `reply`; if any action with a visible effect is rejected the model's reply is discarded and a templated in-character refusal from the city pack's register is spoken instead. The floor is rendered into the vendor's context as a hard rule so the backstop is rarely hit. |
| No stakes, nothing can fail (R3) | Wallet sized to the whole mission chain (overpaying at stall one blocks stall three). One engine-owned `patience.<cast>` fact (3 to 0) decremented by lowball offers below floor minus 5 or repeated confused turns; at 0 the mission fails, the vendor turns away (`Employee.js`), and the debrief says so. Station: `train.departs_at` clock fact fails `get_ticket` after it passes. |
| Station built on Day 7 after the most integration-heavy day (R3) | Station shell (hall via `builders.buildRoom`, counter wall, platform edge, no kit) built on Day 3 alongside the crowd so both archetypes are walkable before any model call. Station kit and train on Day 7 behind a written Day-6 gate. The demo never talks at the station, so a shell with a queue, a board and a PA line carries the beat. |
| Chips promise absent worlds (R3) | Four chips only (Section 5, Day 5). |
| LLM-authored effects can write engine-owned keys (R3) | `validateSpec` whitelists effect targets to `reward` and `info.*`. `wallet`, `bag.*`, `stock.*`, `deal.*`, `ticket.*`, `weather.*`, `train.*`, `patience.*` are written only by `actions.ts` or the event engine. |
| `speech-score` is recognisability (R3, verified) | Debrief labels it "recognised as ..." with the transcript shown; aligned only when the transcript shares half its tokens with a key phrase. |
| No audio subsystem, no files, no unlock, no mixing (critic) | `lib/sim/audio/Ambience.js`: Web Audio unlocked on first click, a city bed plus a zone bed, one-shots on 20-60 s jitter, a bark channel with priority (NPC reply > opening > bark; barks muted while the TalkPanel is open), gain by distance. Three or four CC0 loops sourced on Day 0; licence noted in the repo. |
| `/api/speak` never writes the cache; no service key (critic) | Server-side in-memory LRU (200 entries) keyed by hash(lang, speaker, text); Storage upload only if `SUPABASE_SERVICE_ROLE_KEY` is present; a semaphore caps Sarvam TTS concurrency at 3; openings synthesised at compile, barks on first proximity. |
| Session identity, persistence, transcript of record (critic) | Anonymous `sessionId` in localStorage; server `Map` with Supabase REST write-through (Postgres ports are blocked here; the `sim_sessions` table is created via the Management API); `recordSay` stores both sides' utterances in `state.log` and bumps `version`; the debrief reads the server log, not client memory. |
| No cross-NPC awareness (critic) | The last three applied public mutations are rendered into every NPC context as "recent events", so Noor knows you bought tomatoes and that Lakshmi sent you. |
| Camera clips tarps and shells in a 9 m lane (critic) | Lane 9 m minimum, `world.camDist` reduced to ~6.5, tarps and canopies excluded from the occlusion probe, pitch clamped; tested Day 1 before any dressing. |
| Cast names and personas can misfire on religion, caste, gender (critic) | Names must be picked from a list of twelve supplied from the city pack in the prompt; roles from presets; the model contributes one `quirk_en` of at most twelve words, screened by a denylist and dropped to the template on a hit. |
| Client-side romanisation has no library (critic) | Not attempted. Roman stays in the model output; the English gloss is what moves off the hot path. |
| Evaluation score is whatever the LLM says (critic) | Score computed in code: 40 mission outcomes, 20 price efficiency (paid vs floor and opening), 20 language use (the three `task-conversation` checks from the debrief LLM), 20 minus penalties for English fallbacks and confused turns. |
| Player identity, quotas, mobile, old routes, LiveKit (critic) | Open questions, Section 7. |

### 4.3 Architecture

Six layers, one direction of truth. The model touches layer 2 before a session opens (that is authoring, the same as a human writing `jaipur-date.ts`) and layer 5 during play, where it only proposes. In both places its output is JSON that code validates before a pixel or a rupee changes.

```
  [City card] -> [Situation page: 4 chips + textarea + mic]
        |  POST /api/sim/compile {cityId, prompt}
        v
  SERVER  lib/sim/compile/
    pickCity -> classify (keywords, 0 ms) -> GROQ #1 skeleton (<600 tok, temp 0.3, ~2-3 s)
    -> validate (zod + referential + name list + effect whitelist) -> 1 repair -> authored fallback spec
    -> derive: facts, MissionNodes (templates, completeWhen/failWhen), personas, key phrases
    -> Scenario (schema.ts) + BuildPlan ; openingState -> WorldState -> sim_sessions
    -> GROQ #2 VoicePack (boards, openings, barks, crowd lines; fire-and-forget, ~8-15 s)
    -> Bulbul openings -> TTS cache (memory LRU, Storage if service key)
        |  {spec, scenario, plan, sessionId}
        v
  CLIENT  lib/sim/build/worldBuilder.js  (deterministic, seed = hash(spec), yields per step)
    PlanReveal (authored top-down SVG per archetype; markers + script labels per step)
    shell(archetype, shape, time, weather) -> slots -> groups + canvas boards -> dress clusters
    -> cast at vendor spots -> crowd on waypoints -> traffic/critters -> verify BFS -> budget clamp
    SituationWorld extends BaseWorld   <- Zones = walkability truth
    SimHost loop: Player | crowd | Employee cast | Traffic | Social | Activities | Critters | Sky | Ambience
    HUD (wallet, bag, checklist, minimap, phrasebook) = pure projection of WorldState
        |  hold-to-speak or typed -> /api/stt -> POST /api/sim/turn {sessionId, characterId, transcript}
        v
  SERVER  lib/sim/talk/ + lib/sim/actions.ts + lib/sim/state.ts
    renderContext(knows, visibility, objective, recent events, memory, scriptBlock LAST)
    -> GROQ NPC turn (streamed; actions first, then reply)
    -> actions.ts preconditions + arithmetic -> Mutation[] -> state.applyMutations VETS
    -> settle(): completeWhen / failWhen from facts -> persist -> {reply | templated refusal, transitions, state}
    /api/speak {text, language, speaker} -> Bulbul -> audio
    /api/sim/debrief <- state.log (utterances + mutations) -> code score + GROQ checks
```

Reality flows down the left and changes only inside `applyMutations`. The model sits on the right and only ever hands JSON to a validator.

### 4.4 Authored versus generated

| Authored by hand (once) | Written by the model (per situation) | Decided by code (deterministic) |
|---|---|---|
| Two archetype recipes: `bazaar_lane` (50 m, one- or two-sided, gate and hero at the far end, 6-8 stall slots per side, 3 bench slots, cross street with 2 lanes, waypoint graph, stations, bulb net, tank) and `station_hall` (concourse via `buildRoom`, 2-4 counter slots with queue Zones, board slot, 3 kiosk slots, bench rows, platform edge, train spline, PA hook, forecourt auto bay) | Archetype, shape enums, time, weather, density, hero | Slot assignment order and rules, substitution by tag, auto-fill to density band |
| Six lane groups at hero effort: `sabzi_stall`, `fruit_stall`, `cloth_stall`, `bangle_stall`, `chai_tapri`, `shopfront_bay` (lit, kirana/medical/sweets goods variants); three station groups: `ticket_counter`, `departure_board`, `bench_row`; plus `book_stall` if time allows | Which group and goods variant in which slot | Footprint fit, adjacency (no identical neighbours), one chai per 15 m, one hero |
| ~10 fillers as one InstancedMesh each; continuous tarpaulin spans; tin roofs; hoardings; posters | Shop name and owner per slot (English in call 1, native in call 2) | Cluster placement (place, duplicate, shrink, rotate, offset), nothing on the main path |
| Signage system, board dictionary for the demo scripts, Noto fonts | Cast: role, name from list, slot, speaker, one quirk | Persona from role template plus quirk; knows, wants, provokes from template |
| Three tuned city packs (Hyderabad, Mumbai, Chennai), seven derived | Mission templates filled: item, qty, max price, info key | `MissionNode`s with `completeWhen`/`failWhen`; facts (wallet, bag, stock, price+floor, deal, info, patience, weather, train) |
| Mission templates (`buy`, `ask`, `get_ticket`), key-phrase table per template per demo language, role greetings | Prices: opening and floor per slot item; wallet; one ambient event | Reachability BFS, budget clamp, seed, diff score, engine arithmetic |
| Action vocabulary and preconditions; refusal templates per register | Per turn: reply text plus named actions | Precondition checks, mutation expansion, rejection handling, settle |
| Crowd routine, 2 vignettes, Traffic parts (auto, scooter, train), critters (cow, crows), Ambience, 3-4 audio loops | VoicePack: boards, openings, barks, crowd lines, PA | Bark scheduling, event timing, LOD, adaptive crowd cap |
| PlanReveal SVGs, HUD, TalkPanel, Debrief, DevOverlay, /kit gallery | Debrief: three checks, phrases used, better ways, summaries | Score formula, recognisability alignment |

### 4.5 The exact model outputs

Call 1, the blocking skeleton. Under 600 output tokens, `response_format: json_object`, `reasoning_effort` off, temperature 0.3, `maxTokens: 1200`. The prompt carries the archetype's slot ids, the group catalogue digest, twelve names from the city pack, the mission template list, and two exemplar skeletons.

```json
{
  "archetype": "bazaar_lane",
  "shape": { "frontage": "two_sides", "overhead": "tarp", "ground": "kota" },
  "time": "evening", "weather": "clear", "density": "packed",
  "hero": "charminar",
  "slots": [
    ["L1", "sabzi_stall", "leafy"], ["L2", "fruit_stall", "mango"],
    ["R1", "bangle_stall", "glass"], ["R4", "chai_tapri", "irani"],
    ["B2", "shopfront_bay", "kirana"]
  ],
  "cast": [
    { "id": "lakshmi", "role": "sabziwali", "slot": "L1", "name": "Lakshmi",
      "speaker": "shruti", "quirk_en": "counts in tens and calls everyone babu" },
    { "id": "noor", "role": "bangle_seller", "slot": "R1", "name": "Noor",
      "speaker": "priya", "quirk_en": "will not be rushed" }
  ],
  "missions": [
    { "kind": "buy", "slot": "L1", "item": "tomato", "qty": 1, "max_price": 35 },
    { "kind": "ask", "character": "lakshmi", "info": "bangle_shop_location" },
    { "kind": "buy", "slot": "R1", "item": "bangles", "qty": 1, "max_price": 150 }
  ],
  "prices": { "L1.tomato": { "opening": 40, "floor": 32 }, "R1.bangles": { "opening": 220, "floor": 140 } },
  "wallet": 180,
  "event": { "id": "rain_starts", "after_min": 6 }
}
```

Validation: every slot id exists on the archetype; every group id exists and fits the slot footprint (else nearest by tag); every cast slot is filled; names are from the supplied list; speakers are in `V3_SPEAKERS`; mission slots and characters exist; `floor <= opening`; `wallet` within the archetype's band; the event id is from the enum. On failure, one repair call with the issue list; on second failure, the authored fallback skeleton for that archetype and city.

Code then derives the `Scenario`: locations from slot customer spots; `SimCharacter`s with persona from the role template plus the quirk, `knows` set to the price facts of the character's own slot plus the info facts it can answer, `wants` and `provokes` from the template; facts `wallet`, `bag.<item>`, `stock.<slot>.<item>`, `price.<slot>.<item>` (opening, with floor as a locked fact visible only to that vendor), `deal.<slot>.<item>.price`, `info.<key>`, `patience.<cast>` (3), `weather.rain`, and for the station `ticket.held`, `train.platform`, `train.departs_at`; `MissionNode`s expanded from templates, for example `buy` becomes `completeWhen: [bag.tomato >= 1, deal.L1.tomato.price <= 35]`, `failWhen: [patience.lakshmi <= 0]`, `effects: [reward]`; key phrases from the per-template table for the city's language; the clock from the time enum at rate 3.

Call 2, the non-blocking VoicePack. `maxTokens: 3500`, Indic text expected. Every native string passes `looksLikeTargetScript` or is dropped in favour of the board dictionary or role greeting.

```json
{
  "boards": [ { "slot": "L1", "native": "లక్ష్మి కూరగాయలు", "roman": "Lakshmi Kooragayalu" } ],
  "cast": [ { "id": "lakshmi",
              "opening": { "native": "...", "roman": "..." },
              "barks": [ { "native": "...", "roman": "..." } ] } ],
  "crowd_lines": [ { "native": "...", "roman": "..." } ],
  "pa": [ { "native": "...", "roman": "..." } ]
}
```

Per turn. `actions` is the first key by schema order so it is parsed and vetted before the reply string closes; Bulbul fires the moment `reply.native` closes if every visible action passed.

```json
{
  "actions": [ { "type": "quote_price", "item": "tomato", "price": 35 } ],
  "reply": { "native": "...", "roman": "..." },
  "confused": false,
  "end": false
}
```

The action vocabulary in `lib/sim/actions.ts`: `greet`, `ask_clarify`, `quote_price{item, price}` (precondition: floor <= price <= opening, item in the vendor's slot), `accept_price{item, price, qty}` (precondition: same range, `stock >= qty`, `wallet >= price*qty`; arithmetic: wallet down, `bag` up, `stock` down, `deal` written), `refuse`, `point_to{slot}` (slot filled), `tell_fact{key}` (key in `character.knows`), `end`. Engine-only side effects: `patience` decrements on lowball or repeated `confused`; rejections are recorded with a reason and rendered into the next context.

Debrief, once per session. Code supplies the deterministic facts (missions complete or failed, paid versus floor and opening, turns, English fallbacks, recognised key phrases) and asks for the three `task-conversation` checks plus prose.

```json
{
  "checks": [ { "label": "tried the target language", "pass": true, "evidence": "..." },
              { "label": "responded to what the NPC said", "pass": true, "evidence": "..." },
              { "label": "used a key phrase", "pass": false, "evidence": "..." } ],
  "phrases_used": [ { "native": "...", "roman": "...", "en": "..." } ],
  "better_ways": [ { "you_said": "...", "try_native": "...", "try_roman": "...", "en": "..." } ],
  "summary_en": "...", "summary_native": "..."
}
```

### 4.6 How "the LLM never controls reality" is enforced

At compile time: every geometric or structural field is a closed enum or a catalogue id; names come from a supplied list; personas come from templates; missions come from typed templates whose completion conditions are on engine-owned facts; effects are whitelisted to `reward` and `info.*`; the spec is validated, repaired once, and otherwise replaced by an authored fallback; the built world is verified for reachability and clamped to budget regardless of what the spec asked for.

At run time: the NPC context contains only facts in `character.knows` or with visibility `all`, so it cannot leak what it should not know; the model may only name actions from a fixed vocabulary; `actions.ts` checks each precondition against current facts and does all arithmetic; `applyMutations` rejects unknown keys, locked facts, no-ops and unreachable missions; `settle()` completes or fails missions only from facts; no grader sits in the live loop; a rejected visible action discards the model's reply and speaks a templated refusal; the HUD renders exclusively from returned state; ambient events are written by the engine on the clock; rejections and the last three public mutations are rendered into every NPC's next context so the world stays consistent across characters. The debrief LLM reads the server log and writes prose and three checks; the score is arithmetic.

### 4.7 How variety happens

Two archetypes that share nothing visible come first: open sky versus roof, stalls versus counters, a cow and scooters versus a train and queue tape, hawker calls versus a PA. Within the lane, three eye-height axes change what you see from the spawn: one-sided frontage (a wall of lit bays on one side, stalls on the other) versus two-sided, open sky versus a continuous tarp sheet versus tin roofing overhead, mud versus kota stone versus asphalt underfoot. Then slot fills (12-16 slots, six groups with goods variants, adjacency rules), then every board written in the city's script by the model, then the city pack (shell `archStyle`, hero, vehicle colours, dress mix, goods, names), then time and weather, then cast, prices, mission and one event. A diff score over the skeleton (archetype, shape, slot multiset, variants, cast roles, time) is computed against the last spec for the same city and the compiler re-rolls below 0.5; on Day 4 a downsampled screenshot from the spawn camera is compared for six spec pairs to check that the JSON score tracks pixels at all. What does not vary is stated plainly: the lane is always a lane with shells both sides and the hall always has its counters on one wall. That is the trade Hades, Gungeon and Duolingo Adventures make. The judge never sees two bazaars; the judge sees a bazaar and a station, and on request a second bazaar with a different frontage, cover and cast.

### 4.8 How aliveness happens

Before anyone speaks: a crowd on a walk-to-customer-spot, browse 4-9 s, move-on routine over the stall stations, so people visibly want things; sitters on tapri stools via seat anchors; `Social.js` pairing strangers into speech bubbles in the city script; two vignettes (a haggling pair posed with `Employee.js` gestures at a cloth stall, a chai circle); `Traffic.js` with instanced autos and scooters in regulated colours at the cross street, yielding to you; pigeons flushing and crows on wires; a cow with a lane-blocking state; tarps and flags swaying, festoon bulbs flickering after dusk; at the station a train arriving on a spline every 90 s with a horn and a departure board that flips. Sound: a city bed plus a zone bed, one-shots on 20-60 s jitter, vendor barks in the city language on proximity with cooldowns and a priority rule so nothing talks over the NPC. Purpose: the mission card becomes a checklist; wallet, bag and ticket are always on screen and move only when the engine applies something; the next NPC's blip lights only when its precondition holds. Consequence: prices quoted are facts, the wallet drops by exactly what was agreed, an offer below the floor produces an in-character refusal, patience runs out if you push, rain falls mid-mission and every NPC knows it. Feedback is diegetic in the scene and explicit only afterwards.

### 4.9 How NPC voice conversation plugs in

Within 2.4 m of a cast member's customer spot the `BaseWorld` interactable reads "Talk to Lakshmi (E)". On E the NPC turns to face you and its cached opening plays with subtitles in native and roman. The TalkPanel shows three suggested phrases with transliteration, a hold-to-speak control (Space or the on-screen mic, `lib/useVoice.ts` with live partials) and a text field of equal standing. On release the final blob goes to `/api/stt` with the city language pinned (Day 6 tests `unknown` on code-switched sentences and picks one), the transcript is shown, and `/api/sim/turn` is called. The server renders the context, streams the Groq response, vets actions as they close, fires `/api/speak` the moment `reply.native` closes if the actions passed, applies mutations, settles missions and returns. The client shows the subtitle as soon as the reply string arrives (target about 2 s after release), plays audio when Bulbul returns (target 4-4.5 s, to be measured on Day 6 and written into the demo script), and animates the HUD from returned state. A listening, thinking and speaking indicator sits on the NPC; playback is interruptible; a reply is capped at two sentences; `end: true` closes the panel; walking away ends the turn and the NPC keeps the last eight turns of memory for a return visit. If the transcript is mostly Latin the NPC replies with confusion and a slower repeat and the turn is logged as an English fallback; nothing is marked red.

### 4.10 Budgets and numbers to replace guesses

Frame: measured on the demo laptop on Day 1 and shown on the overlay; a plausible honest target is 400-600 draw calls with merged groups, crowd without shadows, one PCF shadow light at 2048 with `autoUpdate` off for statics, bloom only on a discrete GPU, pixelRatio at most 1.5. The `QualityGuard` frame-time watchdog in `Renderer.js` is wired to the crowd count: two crowd members are retired per window over 19 ms down to a floor of eight. Compile: measured on Day 4 by sending the exemplar skeleton and reading `usage.completion_tokens` and wall time; the design assumes 2-3 s for call 1 and 8-15 s for call 2, and the plan reveal is built to cover either. Turn: measured on Day 6. Xbot: `npx @gltf-transform/cli inspect` on Day 0, decimated to ~12k triangles on Day 9. Every one of these replaces a number that a refuter showed to be wrong by two to three times.

---

## 5. The ten-day plan

The order is the order in which the project has failed before: visuals first, life second, model third, voice fourth, hardening last. Each day ends with something you can see. Two written gates (end of Day 2, end of Day 6) decide scope rather than letting it slip.

**Day 0, this evening (Sep 17).** Housekeeping the refuters found missing. `npm i zod`. Download and subset Noto Sans Telugu, Devanagari and Tamil woff2 into `public/fonts`. Raise `groq.ts` to take an explicit `maxTokens` per call. Create `sim_sessions` via the Supabase Management API (Postgres ports are blocked on this network). Confirm `GROQ_API_KEY` and a Supabase service-role key exist in the real `.env`. Identify the demo laptop and its GPU. Source three or four CC0 ambience loops and note licences. Run `gltf-transform inspect` on Xbot. Grep `Outdoor.js` for its `shoes.js` import to confirm skipping the de-brand. You see: nothing yet; this is an hour of unblocking.

**Day 1 (Sep 18). Floor and the two riskiest unknowns.** Dead-weight commit of everything in Section 2's delete lists with zero importers. New route `app/play` with `components/play/PlayWorld.tsx` mounting `SimHost` on a single `SituationWorld` (`WORLD_CLASSES` replaced by `mount(world)`). `lib/sim/archetypes/bazaarLane.js` shell only at the default shape: ground, lane paving, Zones, cross street, shells from `buildings.ts` both sides with lit ground-floor bays, gate plus Charminar hero, sky, lamps, poles with wire catenaries, bulb net. `lib/sim/kit/signage.js` draws a Telugu and a Devanagari board via Canvas 2D after `document.fonts.load`; the matra test on "किराने की दुकान" and "టికెట్ కౌంటర్" in Chrome, Edge and Firefox. Three measurements: 20 `Avatar.js` bodies versus 20 `people.ts` bodies with `renderer.info` and a screenshot; Charminar visibility from spawn; camera behaviour in the 9 m lane with `camDist` reduced. `DevOverlay` with draw calls, triangles, frame ms, program count. You see: an empty Laad Bazaar lane at evening, lit bays both sides, the gate and Charminar ahead, a Telugu board with correct matras, a frame counter, and two crowds side by side to choose from.

**Day 2 (Sep 19). The kit, at hero effort.** Six lane groups: `sabzi_stall`, `fruit_stall`, `cloth_stall`, `bangle_stall`, `chai_tapri` (stools register seat anchors), `shopfront_bay` with kirana and medical goods variants; each built around goods heaps, with stations, colliders and a sign slot. Continuous tarpaulin spans on bamboo; tin roofs; ten fillers as instanced meshes (crates, sacks, scale, plastic chairs, baskets, buckets, gas cylinder, scooters, posters, hoardings). `worldBuilder.js` v0 fills slots from the archetype default and runs cluster dressing. `/kit` gallery page: every group on a turntable with its variants, footprint, stations, triangle count, city re-tint. End of day: screenshot review with you, a written kill-or-fix list, and the rule that anything not photo-plausible is cut rather than polished. You see: the lane full, goods under tarps, a chai tapri, benches, boards in Telugu. Static, and it should already read as a market photo. Gate 1: if it does not, Day 3 is more art and the station shell moves to Day 4.

**Day 3 (Sep 20). Alive, no model.** The chosen crowd body with three Indian outfit variants if it is `Avatar.js`; `lib/sim/systems/Crowd.js` browse routine over stations; sitters; `Social.js` with ten Telugu lines and Indic wrap; `Traffic.js` with instanced auto and scooter parts in yellow-black; cow FSM and crows; bulb flicker and tarp sway; one vignette (haggle pair); `lib/sim/audio/Ambience.js` with bed, zone layer, one-shots and the bark channel. Station shell: `builders.buildRoom` hall, counter wall, platform edge, forecourt, Zones, no kit. Adaptive crowd cap wired to `QualityGuard`. You see: a living bazaar (people browsing and sitting, chatter bubbles, autos passing, a cow in the way, pigeons flushing, bulbs flickering, a bed of walla and horns) and, behind a debug toggle, an empty station hall you can walk through.

**Day 4 (Sep 21). The compiler.** `lib/sim/compile/{types,validate,prompt,compile,classify,missions}.ts`: the skeleton schema, the referential validator with name list and effect whitelist, mission templates expanded to `MissionNode`s with `completeWhen`/`failWhen`, fact derivation, persona templates, key-phrase table for Telugu, Hindi and Tamil. `state.ts` gains `completeWhen`/`failWhen` in `settle()` and `sim-smoke.ts` is extended. `/api/sim/compile` with one repair and the authored fallback skeletons for both archetypes in three cities. `/api/sim/voicepack` fire-and-forget. `scripts/boards-gen.ts` produces the board dictionary for the three demo scripts. `worldBuilder.js` v1 consumes a spec: mission-critical first, shape enums, adjacency rules, substitution, density bands, BFS reachability, budget clamp, seed. Cast placed at vendor spots with name tags. `scripts/compile-smoke.ts` prints six prompts across three cities with validity, id validity, measured tokens and latency, and the diff score; the screenshot-space check for six pairs. You see: type a sentence and get a bazaar whose frontage, cover, stalls, boards, cast, time and density come from it; when the VoicePack lands the boards redraw with the model's Telugu names; type a different sentence and see it differ in the terminal and in the world.

**Day 5 (Sep 22). The prompt-to-world moment.** `PlanReveal.tsx` with an authored top-down SVG per archetype, markers and script labels animating as build steps complete, honest step text, `scheduler.yield` between steps, `renderer.compileAsync` on a warm-up scene during the Groq call. City packs for Hyderabad, Mumbai and Chennai fully tuned; seven derived. Four light presets plus monsoon. The prompt page with city cards and exactly four chips ("Sunday mandi shopping" packed two-sided under tarps; "Buy bangles for a wedding at Laad Bazaar" one-sided evening under open sky; "Buy a sleeper ticket at Secunderabad"; "Find which platform the Chennai Express leaves from"). The mapping line for free text. "Same errand, new bazaar" re-roll under the diff rule. Supabase cache of skeletons and voice packs by prompt hash. You see: city card to walkable world in about seven seconds with a visible plan being drawn; the same prompt in Mumbai and Hyderabad yields different shells, hero, autos and script; the re-roll button gives a one-sided open-sky gali instead of a two-sided tarp mandi.

**Day 6 (Sep 23). The talk loop.** `lib/sim/session.ts` and `/api/sim/session`. `lib/sim/actions.ts` with the vocabulary, preconditions, arithmetic and refusal templates. `lib/sim/talk/prompt.ts` with the context render, hard-rule floor, recent events, allowed actions and `scriptBlock` last. `/api/sim/turn` streaming with actions-first parsing, script backstop, vetting, settle, rejection handling. `/api/speak` raw mode with the memory LRU and Sarvam semaphore. `TalkPanel.tsx` with hold-to-speak and typed input as equals, suggested phrases, subtitles, indicator, interrupt, closer. HUD bound to returned state. STT pinned versus `unknown` decided on code-switched test sentences. Openings synthesised at compile. You see: bargain with Lakshmi in Telugu by voice or by typing; she quotes 40 from a fact, refuses 30 in character because her floor is 32, settles at 35; the wallet drops to 145 of 180, tomatoes appear in the bag, the mission ticks from facts; an off-topic question gets an in-character redirect; the panel closes on her closer. Gate 2, written: if the loop is not demonstrable end to end by tonight, Day 7 becomes talk-loop hardening and the station stays a shell with a queue and a PA line, which is all the demo needs.

**Day 7 (Sep 24). The station.** Station kit: `ticket_counter` (retail counter plus glass plus queue tape), `departure_board` canvas, `bench_row`, `book_stall` if time allows. Queue activity in `Activities.js`. Train on a spline every 90 s with horn; PA line via cached TTS; station-name board in the city script. `get_ticket` mission template with `train.departs_at`. Station SVG for the plan reveal; classifier keywords for tickets, platform, train in English and Hinglish. You see: type the ticket prompt and the plan draws a different shape; stand in a hall with a queue shuffling forward, a flipping board in Telugu and English, a train pulling in outside, a clerk behind glass who knows the platform and the sleeper fare.

**Day 8 (Sep 25). Closing the loop.** `/api/sim/debrief` and `Debrief.tsx` with the code score and the recognisability labelling. Ambient events on the clock (rain with sky swap and tarps; sold out; train delayed with PA). Stakes wired: wallet sized to the chain, patience decrement and turn-away, `failed` reachable and shown. Cross-NPC recent events in context. Bark scheduler with proximity and cooldowns. `point_to` behaviour and precondition-gated minimap blips. Second vignette (chai circle). Finish button with incomplete missions listed. You see: a whole situation twice (bazaar and station): mission card, living world, two voice exchanges, rain mid-bargain with Lakshmi mentioning it, a debrief with the phrases you used, three better ones, rupees against her opening price, and what you were recognised as saying.

**Day 9 (Sep 26). Hardening.** Perf pass against the measured budget: merged groups, shadow settings, crowd caps, Xbot decimated, bloom gated, pixelRatio. Fallbacks verified: Groq down loads the cached or authored skeleton and a three-exchange canned turn table for the demo NPCs; Sarvam TTS down falls to subtitles; STT empty prompts typed input. Presenter rehearsal: the actual presenter records the six suggested phrases and STT accuracy is measured pinned and unpinned; below 80 percent, the demo bargains by typing while the presenter speaks. Mobile landscape gate. Recorded backup of the reveal and the bargaining beat. Remaining dead weight deleted; README rewritten to describe what runs. You see: a full three-minute dry run on the demo machine with the overlay visible and a backup recording on the desktop.

**Day 10 (Sep 27). Buffer and rehearsal.** Pre-copied prompts, a local run script, two timed rehearsals from a cold start, fixes to whatever broke. No new archetype, no new feature. If clean by noon: kids' cricket from `BallGame` in the lane mouth, crow flocks, a fourth tuned city pack. You see: the demo, twice, under three minutes, from cold.

---

## 6. The three-minute demo

Setup: the demo laptop on Ethernet or a phone hotspot, `/play` open on the city grid, both prompts in the clipboard manager, the recorded fallback minimised, volume up, the presenter's rehearsed phrases on a card.

**0:00-0:20. The pain.** Over the city grid: "You can pass a Telugu course and still freeze in front of a real sabziwali. Every app teaches words. Nobody lets you practise the actual Sunday in the actual bazaar." Click Hyderabad; the card flips to the situation page with the Telugu badge and four chips.

**0:20-0:35. The ask.** Paste "Sunday mandi shopping at Laad Bazaar, buy tomatoes and bangles for a gift" and press Enter. Narrate while the plan appears: "One model call writes the plan: whether the lane is covered, what is in each stall, who is here, what things cost, what I have to do. It never places a vertex and it never sets a price after this second."

**0:35-1:00. The reveal.** The lane blockout fills with markers and Telugu labels one by one; cast names pop with roles; step text flips through "Laying out a two-sided lane under tarps / Placing 16 stalls / Painting boards in Telugu / Casting Lakshmi, sabziwali / Checking every stall is reachable". Crossfade at about seven seconds into the lane at evening, gate ahead, Charminar behind it. Point at a board when it redraws with the model's name: "The browser painted that in Telugu from the model's words."

**1:00-1:30. The walk.** No talking. The crowd browses and haggles, sitters at the chai tapri, autos in yellow-black at the entrance, the cow, pigeons, bulbs on the net, tarps moving, a vendor calling out in Telugu as you pass. HUD: 180 rupees, empty bag, checklist with three items. "Everything moving here is the engine. The model has not been called since the plan."

**1:30-2:15. The exchange.** Press E at Lakshmi. Her opening plays with subtitles. Hold Space and speak (or type the roman phrase while saying it aloud): ask the price. She says forty. Offer thirty. She refuses in character and counters thirty-five. "Forty and her floor are facts in the world state. She proposed a price; the engine checked it." Agree at thirty-five. Wallet ticks to 145, tomatoes appear in the bag, the first item turns green from facts, not from a grader. Ask one off-script thing ("do you sell phones?"): she redirects in character and points down the lane; the bangle-shop blip lights and the second item ticks. "The model controls how she behaves. It cannot change what is true. If it had said thirty, nothing would have moved."

**2:15-2:35. The debrief.** Press Finish. Missions done and the bangles left undone, rupees saved against her opening price, phrases you used, three better local ways to say them, English fallback count, what you were recognised as saying. "Correction happens in the world as confusion; grading happens after, like life."

**2:35-2:55. The second place.** Back to the prompt page, Hyderabad kept. Paste "Buy a sleeper ticket at Secunderabad". A different blockout draws: a counter wall, queue lanes, a platform. Crossfade: a hall with queue tape, a flipping board in Telugu and English, a train pulling in outside, a clerk behind glass, and the PA announcing in Telugu that the train is twenty minutes late. Do not talk to anyone; the world makes the point.

**2:55-3:00. The close.** "Every place is content, not code; the next one is a clinic. Same spec, same engine, same rule: the model never controls reality."

Fallbacks: if Groq stalls at 0:20, the cached skeleton for that exact prompt loads by hash and the plan still draws; if the voice loop breaks at 1:30, the TalkPanel's three canned exchanges for Lakshmi run through the same UI; if the browser dies, the recording covers 0:35-2:15 and the live demo resumes at 2:35; if a judge asks for a second bazaar, press "Same errand, new bazaar" and a one-sided open-sky gali appears with a different cast.

---

## 7. Open questions for you

These are the decisions only you can make. Each changes the plan.

**Scope: two archetypes or one.** Two (lane plus station) gives the "a bazaar and a station" beat every judge asked for, with the station shell built on Day 3 and its kit behind the Day-6 gate; one gives every art hour to the lane and an honest "one place, many situations" claim. The refuters believe two is feasible only because the demo never talks at the station. If you want a talking clerk on stage, that is a third day of station work and something else goes.

**Presenter and language.** Will a Telugu speaker be at the keyboard? If not, should typed input be demonstrated openly (safe, less magical), and should the demo city be one whose script the team can read (Mumbai, Hindi) rather than Hyderabad? This also decides which three scripts get board dictionaries and fonts first.

**Demo hardware.** Which laptop, and does it have a discrete GPU? This sets the crowd cap, whether bloom and soft shadows stay, and whether "60 fps" can be said aloud.

**Crowd body.** After the Day-1 side-by-side (`Avatar.js` with new Indian outfits versus `people.ts` merged bodies), you pick. It is the largest visual choice after the stalls. The trade is ShopVerse's varied silhouettes, hair and sitting poses against SADAK's tapered limbs and draped saree and possibly fewer draw calls.

**LiveKit.** Do you accept parking the worker (removed from main, kept in git) in favour of the REST loop that can read the state engine per turn? The trade is your stated stack and earlier investment against roughly a day of Python for nothing visible in three minutes.

**Stakes.** Should the player be able to fail: patience runs out and the vendor turns away, a tight wallet blocks a later stall, the train leaves? The design says yes because judges remember consequences; a gentler learning tool would keep the wallet loose and correction purely diegetic.

**Out-of-coverage prompts.** When someone types "go to the clinic", remap honestly with a visible line ("we will play this at the chemist bay in the bazaar") or decline and offer the four chips? Always producing a world versus never showing the same lane for two different errands.

**Non-demo cities.** Must all ten cities have native boards and barks from day one, or may the seven non-demo cities fall back to roman boards and role greetings until someone who reads the script has checked them?

**Mission completion authority.** The design derives completion purely from engine facts via typed mission templates. That gives up open-ended goals ("be polite") in the live loop; they survive only as debrief checks. Confirm this is the trade you want; it is what your principle implies.

**Cast names and personas.** Constrain names to the city pack's pools and personas to role templates plus a twelve-word quirk (safe, slightly less variety), or let the model invent freely (more variety, real risk of a religion, caste or gender mismatch in front of judges)?

**Player avatar.** Stay with the grey Xbot, tint and dress it as an Indian character, or use a `people.ts` body for the player? Do NPCs address you by a name or as babu/amma?

**Old routes.** Keep the shipped SADAK game reachable during judging, or hide it so nobody wanders into the wanted-level flow the README still describes?

**Mobile.** Is touch landscape a demo target or post-hackathon? Hold-to-speak, the joystick and the lane camera all change if yes.

**Quotas.** What Groq and Sarvam tiers does the org have? Pre-synthesising openings per compile, board generation for the dictionary and eighteen compile-smoke prompts spend real quota. Should the demo prompts be the only path that spends, with everything else cached by hash?

**Audio.** Are CC0 loops from a public library acceptable for the demo, or does the audio bed need to be recorded or licensed?

---

## 8. Appendix

### 8.1 Refutations, abridged

**Refuter 1 (visuals and variety), verdict: refuted.** "The kit's fidelity ceiling IS the rejected fidelity. `makeStall` is a flat-shaded box counter, four cylinder posts, a box canopy; the rejected `clothStall` is a bakedBox counter, bamboo cylinders and eight box bolts. Same class of object. Fifteen groups with tint variants is fifteen tinted chai stalls. What makes ShopVerse's plaza read as good is composition: every bay has lit glass with a warm interior, an awning, a canvas sign and a halo, and the square is wrapped in a fountain, eight tree species, hedges and a 30-string bulb net. The lane recipe drops every one of those levers and adds two 70 m walls of dead ribbed metal." Fix: five stall groups at hero effort around goods heaps under a continuous tarpaulin, lit bays never shutters, bulb net, trees, one water feature, variants as goods not colours. "Variety at a glance fails on the question's own third case: a clinic compiles to the bazaar lane. The diff score is Jaccard over strings and cannot see pixels. From a third-person camera at y~4 the player sees roughly 40 m regardless of 40/70/90 m length and BaseWorld culls NPCs beyond 44 m." Fix: chips only for existing archetypes; axes that read at eye height (overhead, ground, hero); screenshot-space variety check. "Packed will read as empty: 26 bodies on a 90x9 m lane is one person per 31 m^2. `people.ts` bodies are better looking and cheaper." Fix: people.ts, raise cull, cap lane ~50 m. "Day 2 scope is not credible: a single photo-plausible authored prop costs 80-100 lines each iterated with a preview." Fix: five groups plus eight fillers over Days 2-3; Day 4 compiler only if they pass. "Charminar at ~13 m behind a gate flanked by 10.6 m shells will be largely occluded." Fix: scale 2x with a gap, or place at the lane mouth.

**Refuter 2 (feasibility), verdict: refuted.** "Days 1-3 each contain roughly 2.5-3 days of work. Day 1 alone: SimHost refactor, a 1,332-line Outdoor.js de-brand that still imports data/shoes.js, Indic canvas signage with fonts not in the repo, a bazaar shell bridging two incompatible material systems, poles, catenaries, bulbs, DevOverlay. Day 2 asks for ten hand-modelled groups with variants, stations and colliders plus 20 fillers plus worldBuilder v0 plus a gallery; Outdoor.js took 1,332 lines for one square." Fix: one demo archetype primary, station as stretch, kit frozen at 8 groups and 10 fillers, skip the de-brand. "The blocking spec call is ~2,500-3,000 tokens, not ~900: 20-30 slot entries, 3-4 personas, 10-15 facts, MissionNodes with Condition/Mutation unions, native phrases at 3-4 tokens per character; ~7 s plus a repair doubles it; groq.ts defaults max_tokens to 512." Fix: a 350-450 token skeleton with slot triples and mission titles, facts and MissionNodes derived in code, prose in the VoicePack, explicit maxTokens, temperature 0.3. "26 Avatar.js bodies at ~15 meshes is ~390 draw calls before a single stall; realistic total 700-900." Fix: honest budget, cap crowd 12-16, no crowd shadows, merge group parts. "Per-turn latency is understated by ~1.7x: a 350-450 token triple-form reply is ~1.5-1.8 s; audio lands at ~5.5-6.5 s." Fix: native plus short gloss only, stream and fire Bulbul on the first closed string, grader every second turn or never. Dependencies missing: zod, fonts, sim_sessions, boards.json for ten languages nobody can read. Presenter STT risk: rehearse; make typed input first-class.

**Refuter 3 (the principle), verdict: refuted.** "Mission completion is LLM-graded, not engine-derived. `state.ts` settle() only promotes locked to active; active to complete happens only through an explicit mission mutation, and the design sources that from a parallel Groq grader that never sees whether accept_price was applied. That is the LLM controlling reality at the one line of the demo a judge is invited to test." Fix: `completeWhen: Condition[]` in MissionNode and a settle step; typed mission templates; drop the per-turn grader. "Reply text and actions arrive in one output and are vetted afterwards; on a rejection the NPC says 'done, 30' while nothing happens." Fix: do not play the returned reply on a visible rejection; template a refusal; render the floor as a hard rule. "No stakes and no failure path: 500 rupees against 35-rupee tomatoes, provokes with no anger fact, a train that can be late but never missed." Fix: wallet sized to the chain, a patience fact, a departs_at deadline. "Chips promise worlds that will not exist." Fix: four chips across the two archetypes. "The variety claim rests on a station built in one day after the most integration-heavy day." Fix: station shell on Day 3, compiler targets both on Day 4, Day 2 cut to six groups. Also: effects whitelist; speech-score labelled as recognisability.

**Critic (what everyone missed).** Missing subsystems: audio (no manager, no files, no unlock, no mixing), the TTS cache write path (speak only reads; publishable key only), session identity and persistence (no migration; Postgres ports blocked), the transcript of record, a mission end and failure lifecycle, cross-NPC awareness, a camera that survives a 9 m enclosed lane, client-side romanisation (no library), content safety for Indian cast, player identity, API quotas, an evaluation rubric, a perf measurement plan, and a Day-0 checklist. Verified false: "state.ts unchanged" can complete missions; groq.ts can carry the compile call as is; speech-score measures pronunciation. Unresolved between refuters: crowd body, macro enums, station timing. Sources nobody read: reference photography, Sarvam docs, Groq limits, the original ShopVerse authoring process.

### 8.2 Sources

Academic scene generation: Holodeck (arXiv 2312.09067), LayoutGPT (2305.15393), I-Design (2404.02838), AnyHome (2312.06644), SceneCraft (2403.01248), Infinigen Indoors (2406.11824), ProcTHOR (2206.06994), PhyScene (2404.09465), Text2Room (2303.11989), Imperative vs Declarative layout (2504.05482), LayoutVLM (2412.02193), DisCo-Layout (2510.02178), Hierarchically-Structured Scene Synthesis (2502.10675), SceneWeaver (2509.20414), Scenethesis (2505.02836), SceneSmith (2602.09153), SAGE (2602.10116), Holodeck 2.0 (2508.05899), Imaginarium (2510.15564), MarketGen (2511.21161), CityX (2407.17572), CityGenAgent (2602.05362), WorldCraft (2502.15601), AutoUE (2603.07106), LLplace (2406.03866), OptiScene (2506.07570), Roblox Cube (2503.15475), Gen-C (2504.01924), 3D Scene Generation Survey (2505.05474), Word2Minecraft (2503.16536).

Game industry: Fallout 4 kit talk (archive.org GDC2016Burgess), Joel Burgess on modular kits (80.lv), Level Design Book on modular kits and environment art, Daniel McGowan on environment art stages (80.lv), Synty POLYGON City Pack, Caves of Qud WFC notes (christianjmills.com), How Townscaper Works (gamedeveloper.com), Hades level design (kotaku.com), Enter the Gungeon generation (boristhebrave.com), Ghost Recon Wildlands procedural settlements (80.lv), Assassin's Creed Syndicate world design transcript, The AI of Hitman 2016, AC Unity AI recycling (GDC 2015), Skyrim idle markers (nexusmods articles/2467), GTA V pedestrian dialogue (gamedeveloper.com), game ambience layering (gameaudiolearning.com), Sahapedia on hand-painted signs, ArchDaily on temporary architecture in India, Laad Bazaar (AFAR), auto-rickshaw colours (ichangemycity), Detective Dotson review (digit.in), Yakuza locales (gamedeveloper.com), open-world pacing (strayspark.studio).

Web 3D: three.js best practices (utsubo.com), draw-call guidance (threejsroadmap.com), skinned-mesh optimisation thread (discourse.threejs.org/t/58196), InstancedMesh culling (discourse t/22633), @three.ez/instanced-mesh (github.com/agargaro/instanced-mesh), BatchedMesh docs and forum t/81221, shadow optimisation (discourse t/64681, t/50401), UnrealBloom cost (discourse t/35476), PMREMGenerator docs, shader compile time (discourse t/56572), troika Indic shaping issue #303, Skia canvas text design doc, HarfBuzz Indic shaper, Nirmala UI and Kohinoor font coverage, MDN CSS Font Loading API, CanvasTexture upload cost (discourse t/50288, t/7441), NN/G response times and progress indicators, Google/SOASTA mobile speed benchmarks, CrazyGames first-frame guide, CHI EA 2025 on generative waiting, Artificial Analysis Qwen3-32B provider benchmarks, scheduler.yield (developer.chrome.com).

Product and UX: Meta WorldGen blog and arXiv 2511.16825, Project Genie and Genie 3 (Google DeepMind), Roblox Cube newsroom, Meta Horizon GenAI tools, Unity AI (cgchannel.com), Rosebud prompt-to-world essay, Stanford generative agents (github joonspk-research), Inworld Origins hands-on (newatlas.com), NVIDIA ACE critiques (pcgamer.com, dexerto.com, creativebloq.com), Convai Narrative Design docs, State-Inference-Based Prompting for trading NPCs (arXiv 2507.07203), LLM NPC cognitive load (2604.10107), Symbolically Scaffolded Play (2510.25820), Duolingo Video Call engineering blog and Adventures post, Mondly VR, Noun Town (roadtovr.com), ImmerseMe review, VR and willingness to communicate studies (ScienceDirect 2024, Nature HSSC 2025), Praktika reviews, Character.AI Scenes, Indilingo, Sarvam Bulbul v3 blog, AWS Cloudscape generative-AI loading states, Devpost judging and demo guides.

Repository readings: `game_engine/lib/game/**`, `game_engine/lib/sim/**`, `game_engine/app/api/**`, `game_engine/components/**`, `agent.py`, `judge.py`, `token_server.py`, `docs/HANDOVER.md`, `teampounce-mine/shopverse/src/world/**`, `public/models/Xbot.glb` (parsed locally: 49,112 tris, 28,374 verts, 67 joints, 2 materials).
