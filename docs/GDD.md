# Pıtır'ın Kristal Adaları — Game Design Document (final)

Status: **approved design** (synthesis of the three proposals; winner *world-and-wonder*, grafted with *mechanics-first*'s
teaching/boss layer and *progression-and-polish*'s meta/accessibility layer, every judge weakness resolved — see §8).
Engineers build from this document and `docs/ARCHITECTURE.md`; if something is missing, add it here in the same change.
Prose is English; **every string the player sees is Turkish**.

Repo facts this design relies on (verified 2026-11-08): engine is already split under `src/engine` (physics hooks
`onLand/onStand/onBonk/onLeave`, `extVel` decaying `exp(-6dt)` grounded / `exp(-1.5dt)` airborne, `launch()`,
`hazard('lava'|'spike')`, `SURFACES` with `ice`, `noSolid`, movers carried through `collider.delta`, step-up rule
`top - p.y < 0.4` strict, `FALL_MULT 1.7`, `MAX_FALL 32`, `GRAV ≈ 44`), `world.js` has `L.trigger/dynamic/remove/prop/scatter/sign/light`
and `world.emit/on` signals, `save.js` is v1 with `ensureUnlocks`, `screens.js` has select/win/pause, `touch.js` is a
stub, `mechanics/index.js` is empty, `player.js` exposes `pSpin` + `setScarfColor`. `audio.js` already decodes only the
CORE set and `ensure()`s the rest lazily. Assets on disk: 57 kit models, 23 PBR sets, 9 HDRIs (1k + 2k), 230 sfx.

---

## 1. Vision & pillars

Pıtır, a cheerful orange ball with a leaf sprout and a scarf, sails from island to island to bring the seven Sun Crystal
sets home. **Every island is a postcard** (one silhouette you see from the spawn flag, a sky you have not seen before, a
high place where the camera pulls back) and **every island teaches one or two new toys in a safe sandbox before mixing
them**. Nothing ever needs a new button: walk, jump (hold = higher, 3 in a row = triple), pound (B in the air). Failure is
cheap and funny (one heart, a splash, a flag a few seconds back); mastery earns stars and hats, never progress.

Pillars (in priority order when they conflict):
1. **A six-year-old on a phone can finish every island.** Numeric kid-safety rules (§2.0) are hard limits.
2. **Wonder over difficulty.** Set pieces a child retells: the ski run, the whale, the chest that opens, the lighthouse.
3. **Realistic materials, cute characters.** Realism comes from Poly Haven PBR ground + HDRI skies and ≤ 4 decimated
   hero props per island; bulk vegetation stays the stylized kit; Pıtır and enemies stay toy-like.
4. **Static web game first.** No backend, `localStorage` progress, everything vendored; later wrapped with Capacitor.
5. **Readable hazards.** Every hazard telegraphs ≥ 0.5 s (wobble, chime, streaks, squash) and is one-button to avoid.

---

## 2. Level roster

### 2.0 Global level rules (hard limits — `tools/smoke.mjs` checks the ones marked ✓)

| Rule | Value |
|---|---|
| Walkable tops on the main path | ≥ 2.4 m (we use 2.6 m planks/stones) ✓ |
| Single-jump gap on the main path | ≤ 5.5 m with ≤ 2.5 m rise (6.5 m only for secrets) ✓ |
| Stair/step rises | 1.4 m (comfortable single jump); walk-up "ramps" are stepped boxes with rises ≤ 0.35 m (engine step-up is `< 0.4` strict) |
| Crumble delay | ≥ 1.0 s on every island (Yardım Modu ×1.5) |
| Wind speed | ≤ 4 m/s horizontal; never across a bridge narrower than 4 m; never on a path over a fall |
| Bobbing platforms | amplitude ≤ 0.35 m (0.7 m travel), period ≥ 3 s |
| Rolling boulders | one lane, period ≥ 5 s, r 1.1 (jump height 3.2 clears it) |
| Enclosed spaces | **none**: no roof lower than 9 m above any walkable floor; "caves" are open-top trenches with walls ≤ 4 m |
| Telegraph | every hazard warns ≥ 0.5 s before it can hurt |
| Island 2 | introduces at most two mechanics (cannon, bob) |
| Camera | paths lead away from the default camera (`spawnFacing` toward the first objective); `cam.auto` re-centres behind Pıtır after 1.2 s without look input |
| Draw calls (GL-wrapped, main + shadow + reflection) | ≤ 900 high / ≤ 500 medium / ≤ 250 low ✓ |
| Lights | ≤ 3 real `PointLight`s active at once (pooled), rest emissive sprites |
| Every crystal reachable | `testPath` waypoint list from spawn to each crystal and the portal ✓ |

Conventions: metres, Y up, sea level `-1.0` (water plane `-1.2`), `top` = walkable top Y; coordinates `(x, y, z)`;
spawn faces `-z` unless stated. Each island has **5 named crystals, ≥ 4 checkpoints, 1 vista (Kartpostal), 1 secret
coin cache, 1–2 signposts**, and a portal placed next to the spawn flag (except `volkan`/`fener`, see below).

### 2.1 Roster overview

| # | id | Name | New mechanics | Reused | Enemies | Coins | Par |
|---|---|---|---|---|---|---|---|
| 1 | `kristal` | Pıtır'ın Kristal Adası | — (signposts teach run/jump/triple/pound/pads/movers) | — | slime, spiky | 80 | 240 s |
| 2 | `kumsal` | Gün Batımı Koyu | **cannon**, **bob** | pads, movers | slime, spiky, **crab** | 95 | 210 s |
| 3 | `kar` | Kar Zirvesi | **ice**, **crumble** (ice/rock skin) | pads, movers | slime (sliding), spiky (icicle), **boulder** (snowball) | 95 | 240 s |
| 4 | `volkan` | Volkan Adası | **lava**, **geyser**, **eruption** (level.update) | crumble (rock), movers, boulder (lava) | slime, spiky, boulder | 100 | 240 s |
| 5 | `orman` | Kadim Tapınak | **key & door**, **switch + riser** (timed) | crumble (wood), pads, movers | slime, spiky, **bat** | 110 | 270 s |
| 6 | `gok` | Gökyüzü Takımadaları | **updraft**, **wind**, **orbiter** | cannon, crumble (cloud), pads | slime, spiky, bat (bird skin) | 100 | 240 s |
| 7 | `fener` | Fener Adası | **lantern**, **boss Kral Pelte** | ice, crumble, riser, pads, cannon | slime, spiky, bat, boss | 100 | 300 s |

Bonus nodes on the map (not built now, shown as "Yakında"): `kanyon` (Kızıl Kanyon, desert, unlock at 15 ★).

### 2.2 Theme blocks

All ids exist in `assets/` unless marked **dl** (download via `tools/fetch-polyhaven.mjs`, optimise with
`tools/optimize-glb.mjs`, credit in `assets/CREDITS.md`). Fields are ARCHITECTURE §5. `tint/scale` per role.

| id | hdri (rot) | sun dir · colour · int | hemi sky/ground | ground / cliff / stone / accent | water (sunColor) dist | fog colour near→far | particles |
|---|---|---|---|---|---|---|---|
| kristal | kloofendal_48d_partly_cloudy_puresky (0) | [.555,.743,.374] fff1d6 2.6 | dff4ff / 6a8f4a .8 | aerial_grass_rock e4ffc4/5 · rock_face e8ddd0/6 · stone_tiles_02 fff2e0/3 · coast_sand_01 ffefc8/5 | 1c8fd1 (fff1d6) 2.2 | d6ecff 90→230 | none |
| kumsal | kloppenheim_06_puresky (1.2, sun over the pier) | [.2,.25,.95] ffb070 2.2 | ffd9b0 / 8a6a4a .7 | sand_03 ffe2b8/3 · rock_face_03 e0b090/4 · weathered_planks ffffff/2 · coral_gravel ffffff/4 | 1b6f86 (ffa050) 1.6 | ffd3ad 70→200 | none |
| kar | snow_field_puresky (0) | [.3,.6,.5] e8f0ff 1.6 | eaf2ff / 9aa6b4 .9 | snow_02 ffffff/2 nrm .5 · rock_wall_08 c8d0dc/3 · marble_cliff_01 d8f0ff/4 (reads as ice) · snow_02 e6eef8/2 | 5fa8cc (ffffff) 1.2 | e6edf5 45→150 (close fog = snowfall) | snow |
| volkan | wasteland_clouds_puresky (0) | [-.4,.5,.6] ffa060 2.0 | d9a080 / 3a2a24 .6 | rocks_ground_06 9a8f88/3 · rock_boulder_cracked c87850/2 · rock_face 6a6060/4 · dry_ground_01 808080/3 (ash beach) | **lava** `{kind:'lava', color: ff5a1f, glow: ffb060}` | d99a7a 55→170 | embers |
| orman | kloofendal_misty_morning_puresky (0.4) | [.3,.8,.3] fff4d0 1.8 | d8e8d0 / 3f5a3a .8 | forest_leaves_02 d4e8b0/3 · mossy_stone_wall ffffff/2.5 · mossy_cobblestone ffffff/2 · rock_face a8b8a0/4 | 2a8c6c (fff0c0) 1.0 | cde2cf 45→150 | leaves |
| gok | kloofendal_43d_clear_puresky (0) | [.4,.8,.4] ffffff 2.8 | e8f6ff / 9fb0c0 .9 | aerial_grass_rock d8ffb8/4 · rock_face_03 d8ccc0/4 (undersides) · weathered_planks ffffff/2 · marble_cliff_01 e8f4ff/4 | **null**; `fall: { y: -30, kind: 'cloud' }`, cloud-sea plane at −35 | dff2ff 110→320 | sparkles |
| fener | kloppenheim_02_puresky (0.8; bg 1.2, env .35) | moon [-.4,.7,.5] 9fb8ff 0.9 | 33457a / 0e1424 .7 | aerial_grass_rock 8ea0d0/5 · rock_face 7f88a8/5 · stone_tiles_02 a8b0cc/3 · coast_sand_01 9aa4c8/5 | 0b2650 (a8c4ff) 1.4 | 161f45 40→150 | fireflies |

Low tier: every fog `near/far` ×0.7, 1k HDRIs (`assets.js` must prefer `_1k` on medium/low), flat lava/water.

### 2.3 Props per island (kit = `assets/models`, instanced through `L.scatter`; **hero** = Poly Haven realistic, ≤ 4 per island, decimated ≤ 20k tris, meshopt + 512 px WebP)

| id | kit (bulk) | hero (dl unless present) |
|---|---|---|
| kristal | tree_oak, oak_young, palm_mature/young (beach ring), bush_round, grass_tuft_*, flower_*, boulder_01 (present) | — |
| kumsal | palm_*, lambis_shell, old_military_crate, boulder_01, Lantern_01 (present, decimated 3.4k, glass swapped) | **cannon_01** (41k → 12k), **ocean_buoy** (12k), **treasure_chest** (103k → 15k) |
| kar | pine_columnar/spreading/windswept/sapling, stump_pine, boulder_* (tint dfe8f0), Lantern_01 | **wooden_lantern_01** (8k, cabin), **dead_tree_trunk_02** (83k → 15k, fallen log) |
| volkan | dead_snag_tall/short, dead_tree_trunk, namaqualand_boulder_02, rock_pile, slab_upright | **moon_rock_02/04/06** (3–14k, scale ×8) |
| orman | oak_ancient, birch_*, fern_clump/single, root_cluster, mushroom_group, moss_patch, stump_mossy, slab_*, boulder_mossy, hedge_block | **gothic_statue** ×2 (28k → 15k), **large_castle_door** (12.6k), **lion_head** (47k → 12k), **fern_02** (6k, ground cover) |
| gok | birch_young/leaning, flower_white_patch, meadow_disc, topiary_cone, Lantern_01, cliff_block | **bronze_whale_statue** (3.8k, scale ×7), rock_face_03 texture on undersides (no mesh) |
| fener | oak_ancient, birch_*, mushroom_group (emissive tint), boulder_mossy, Lantern_01 ×12 | — (Lantern_01 is the hero) |

Photogrammetry props next to the kit get `tint` toward the theme palette (e.g. gothic_statue `b8c0b0`) so they do not clash.

### 2.4 Island 1 — `kristal` · Pıtır'ın Kristal Adası (order 1, par 240 s, coins 80)

Existing island, kept 1:1 (`src/levels/kristal.js` coordinates are canonical) with light improvements:
- Trees: the 22 seeded procedural trees become `L.tree(kind:'oak')` inland and `palm` for the 6 nearest the beach ring; flowers stay (`L.flower`, instanced); add `L.scatter('grass', {count: 40})`.
- Signposts (`L.sign`): (0, 0, 19) **"Zıpla! (A — basılı tut: daha yükseğe)"**, (-10, 1, 10) **"Koşarken üst üste 3 kez zıpla!"**, (14, 0, -6) **"Havada B: yere çakıl!"**, (-17.5, 0, 18) **"Zıplama yastığı: üstüne bas!"**.
- Heart `L.heart(18, 1, 8)`. Secret: cove behind two leaning palms on the west beach `L.secret(-31, -0.3, 22, {coins: 10})`.
- Vista on the tower top `L.vista(6, 15.6, -14, {title: 'Ada Panoraması', yaw: 2.4, pitch: 0.35, dist: 22})`.
- Crystals (unchanged): ① Merdiven Tepesi (-8, 9.2, -6.5) · ② Doğu Adacığı (56, 2.6, 10.5) · ③ Hareketli Taşlar (33, 4.9, 38) · ④ Uçurum (-26.5, 11.6, 16) · ⑤ Kule (6, 15.6, -14). Checkpoints, enemies, portal (-7, 2.5, 23) unchanged.
- Wow vista: the tower top looking south over the whole island and the two islets.

### 2.5 Island 2 — `kumsal` · Gün Batımı Koyu (order 2, par 210 s, coins 95)

Sunset lagoon with a plank pier, a shipwreck you reach by cannon and a treasure islet. New: **cannon**, **bob**. Enemies: 4 crabs, 5 slimes, 2 spikies. Music `music_tropical_steel`, ambience `amb_waves` + `wind_breeze`.

Layout (≈ 130 × 80 m):
- Sand island `L.island(0, 0, 0, 26, 8, {beach: true})` (beach ring r 31), palm ring r 10–20 (`L.scatter('trees:palm', {count: 14})`). Spawn (0, 0.1, 18), facing −z; `camYaw 0`.
- Central hill `L.cyl(4, 7, -6, 8, 7)`; crate steps (old_military_crate, box collider 2.6², rises 1.4): (13, 1.4, -1), (13.5, 2.8, -4), (13, 4.2, -7), (12.5, 5.6, -9) → hill rim.
- West cliff `L.box(-22, 7, -4, 10, 10, 7)`; crate steps up its south face (-16, 1.4, 2), (-18, 2.8, 0), (-20, 4.2, -1), (-22, 5.6, 0) → top.
- Pier: planks `L.box(x, 0.4, 28, 3, 2.6, 0.5, {mat: 'stone'})` for x = 4, 7, …, 34 (continuous, no crumble); Lantern_01 every 6 m; vista at the pier end (34, 0.4, 28) facing the sun.
- Buoy rafts (`L.bob` on a 2.6² plank box + ocean_buoy prop at a corner, amp 0.35, period 3, phases 0/.25/.5/.75): (41, 0.6, 27), (46, 0.9, 25), (51, 0.6, 27), (56, 0.9, 25) → rock stack `L.cyl(61, 2.6, 27, 3, 4)`.
- Cannon A `L.cannon(-24, 7, -6, {to: [-58, 1.1, -26], apex: 8})` on the cliff → wreck deck. Cannon B (return) `L.cannon(-55, 1, -22, {to: [-12, 0.1, -10], apex: 9})` on the deck → beach.
- Wreck islet: deck `L.box(-58, 1, -26, 14, 6, 2, {mat: {side: 'stone', top: 'stone'}})`, upper deck `L.box(-61, 3.2, -27, 8, 6, 2.2)`, mast `L.cyl(-58, 12, -26, 0.4, 12)`, crow's nest `L.box(-58, 12, -26, 2.6, 2.6, 0.5)`, bounce pad `L.bouncePad(-61, 3.65, -24, 1.2, 32)` → nest.
- Sea arch (open, replaces the sea cave): two wall boxes `L.box(-5, 5, -29, 3, 6, 5)` and `L.box(5, 5, -29, 3, 6, 5)` with an arch roof `L.box(0, 10.5, -29, 13, 6, 1.5)` (bottom at 9 m: above the camera rule) over a damp-sand pocket; shell pedestal `L.cyl(0, 0.3, -31, 1.2, 1.3, {mat: 'stone'})`.
- Treasure islet `L.cyl(40, 1.5, -22, 5, 4)`; east buoy rafts (29, 0.5, -13), (34, 0.8, -17) from the east shore (26, 0, -10).
- Secret `L.secret(-30, -0.3, 20, {coins: 10})` under a rock arch of two boulders. Heart on the wreck deck (-54, 2, -27).

Crystals:
1. **Fener Kayası** (61, 4.0, 27) — pier → four buoy rafts → rock stack. Teaches bob (only coins at stake on the first two rafts, which sit 1 m from the pier end).
2. **Gözcü Yuvası** (-58, 13.4, -26) — cliff cannon (sign **"Topun içine gir — Pıtır uçar!"**) → deck → bounce pad → crow's nest; cannon B brings you home.
3. **Deniz Kemeri** (0, 1.7, -31) — a shell-coin trail from (10, 0, -20) through the arch past a spiky patrolling (-3, 0, -26)↔(3, 0, -26).
4. **Palmiye Tepesi** (4, 8.4, -6) — crate steps up the hill through 3 slimes.
5. **Hazine Adacığı** (40, 3.0, -22) — east rafts → islet; the chest lid opens as you come within 3 m (`L.dynamic`, 1 s tween, `key_pickup_twinkle`) and the crystal rises 1.5 m out of it.

Checkpoints: (2, 0, 17) spawn, (12, 0, 22) pier root, (-20, 7, -2) cliff top, (-56, 1, -24) deck, (27, 0, -9) east shore. Portal (-6, 2.5, 20).
Vista: pier end **"Gün Batımı"**. Wow: the cannon flight over the lagoon into the sunset.

### 2.6 Island 3 — `kar` · Kar Zirvesi (order 3, par 240 s, coins 95)

A snowfield with a frozen lake, a ski run and a three-tier summit. New: **ice**, **crumble**. Enemies: 5 sliding slimes (blue), 3 icicle spikies, 2 snowballs. Music `music_winter_dance`, ambience `snow_wind_loop_1` (quiet).

Layout (≈ 90 × 70 m):
- Snowfield `L.island(0, 0, 0, 28, 8)`; cabin (plank boxes 6×5×3 at (8, 3, 16), wooden_lantern_01 by the door) and spawn flag (6, 0.1, 14) facing −z (toward the summit).
- Tier 1 `L.cyl(0, 7, -12, 14, 7)`; tier 2 `L.cyl(-2, 14, -14, 8, 7)`; summit `L.box(-4, 22, -17, 6, 6, 8, {mat: 'stone'})` (marble = ice).
- East stairs to tier 1 (3×3 boxes, rises 1.4): (20, 1.4, -2), (19, 2.8, -5), (18, 4.2, -8), (17, 5.6, -11) → tier 1 rim (14, 7, -12).
- Snowball lane north of the lake road: `L.enemy('boulder', [26, 0, -8], [14, 0, -2], {every: 5, duration: 3, skin: 'snow'})` (sign at (22, 0, 2): **"Kartopu geliyor — üstünden zıpla!"**).
- Frozen lake `L.ice(L.box(31, 0.1, 2, 18, 14, 1.2, {mat: {top: 'stone'}}))` (marble top reads as ice; x 22…40, over the sea beyond the island edge). Sign (24, 0.1, 6): **"Buz kaygan! Erken dön."** Floes (`L.crumble(…, {skin: 'ice', delay: 1.0, respawn: 5})`, `L.ice` on each) 2.6² at (42, 0.3, 2), (45, 0.5, 0), (48, 0.7, 2) → islet `L.cyl(54, 1, 2, 4, 4)`.
- Ski run (`L.ice` boxes 4×4, each 0.35 m lower, side rails `L.box` 0.5 wide × 0.8 tall on both edges so you cannot fall off): 14 boxes along a curve from the tier-1 west rim (-16, 6.65, -10) to (-26, 2.1, 6); the run ends in a snow bowl islet `L.cyl(-31, 1.8, 10, 5, 4)`. Way back: stones (-27, 1, 4), (-24, 0.3, 0) → island.
- Crumble ice steps tier 1 → tier 2 (2.6², `skin: 'ice'`, delay 1.0): (10, 8.4, -9), (9.5, 9.8, -12), (9, 11.2, -15), (8.5, 12.6, -18) → tier-2 rim (5.6, 14, -15.5).
- Bounce pad on tier 2 `L.bouncePad(1, 14.45, -15, 1.2, 32)` → summit (rise 8, 2.5 m horizontal to the box edge).
- Ice valley (open trench): marble walls `L.box` 1 × 4 × 10 flanking a 4 m wide `L.ice` corridor from (-12, 0, 6) to (-20, 0, 14); icicle spikies cross it (3 lanes); crystal pillar `L.cyl(-22, 0.5, 16, 1.2, 1.5)`.
- Giant pine `L.prop('pine_columnar', 16, 0, -24, {scale: 2.5, collide: 'cyl', r: 1.1, h: 14})` ("Sincap Ağacı"): mushroom bounce pads (styled `bouncePad`, 27): (16, 0.45, -21) → ledge `L.box(18, 6, -24, 3, 3, 0.8)`; pad (18, 6.45, -24) → canopy `L.box(15, 12.5, -22, 3, 3, 0.8)`.
- Igloo `L.cyl(-6, 0, 8, 2.5, 2)` with the secret inside its open doorway `L.secret(-6, 0, 10.5, {coins: 8})` + heart. Fallen log (dead_tree_trunk_02) as decoration near the cabin.

Crystals:
1. **Donmuş Göl** (54, 2.4, 2) — slide across the lake (sliding slimes), three floes crack behind you, islet.
2. **Kayak Pisti** (-31, 3.2, 10) — ride the ski run along a coin line into the bowl; the rails make it impossible to fall; "you cannot stop" is now safe.
3. **Zirve** (-4, 23.4, -17) — east stairs → tier 1 → crumble ice steps → tier 2 → bounce pad → summit. Vista here.
4. **Buz Vadisi** (-22, 1.9, 16) — the ice corridor with three icicle spikies crossing it; stop early on ice (taught at the lake first).
5. **Sincap Ağacı** (15, 13.9, -22) — mushroom pads up the giant pine.

Checkpoints: (8, 0, 12) spawn, (24, 0, 4) lake shore, (14, 7, -8) tier 1, (6, 14, -12) tier 2, (-14, 0, 8) valley mouth. Portal (2, 2.5, 18).
Vista: summit **"Zirve"**. Wow: the ski run.

### 2.7 Island 4 — `volkan` · Volkan Adası (order 4, par 240 s, coins 100)

A stepped cone with a lava crater; the sea is lava. New: **lava**, **geyser**, **eruption**. Reused: crumble (rock), movers, boulder (lava skin). Enemies: 6 orange slimes, 3 red spikies, 1 lava boulder. Music `music_space_race` → `music_boss_epic_loop` during the eruption; ambience `lava_flow_loop` + `lava_bubbles_loop` + `lava_rumble_loop`.

Layout (≈ 90 × 80 m):
- Base `L.island(0, 0, 0, 26, 8, {beach: true})` (ash beach accent); tier 1 `L.cyl(0, 6, 2, 18, 6)`; tier 2 `L.cyl(0, 12, 4, 10, 6)`; crater rim: 8 boxes 6×3 top 15 on a ring r 7 around (0, ·, 4) (gaps of 1 m between them are fine: tops are 2.4+ wide); crater floor `L.cyl(0, 13, 4, 7, 2, {surface: 'lava', noSolid: true})` under a lava pool `L.lava(0, 13.3, 4, 13, 13)`.
- Spawn (0, 0.1, 24) facing −z; sign (0, 0, 20): **"Lav yakar! Sadece taşlara bas."**
- Tier steps (3×3 boxes, rise 1.4). **Rule for cones: stairs climb the cylinder's side as boxes whose footprints overlap the cylinder** (they poke out of the cliff; the collider overlap is harmless). Base → tier 1 (south-east face): (12, 1.4, 16), (12.5, 2.8, 13.5), (13, 4.2, 11), (13.5, 5.6, 8.5) → tier 1 top. Tier 1 → tier 2: (8, 7.4, 10), (7, 8.8, 8), (6, 10.2, 6), (5, 11.6, 4) → tier 2 top. Tier 2 → rim: (4, 13.4, 10) → rim box top 15 at (0, 15, 11).
- East lava bay: stepping stones 2.6² from the east shore (26, 0, -2): (29, 0.5, -2), (32.5, 0.8, -1) **crumble rock delay 1.0**, (36, 1.1, -2) → basalt column `L.cyl(40, 3, -2, 2.5, 5)`.
- West geyser terraces: `L.box(-18, 4, 6, 6, 6, 4)`, `L.box(-24, 8, 0, 6, 6, 4)`, `L.box(-28, 12, -6, 6, 6, 4)`; geysers `L.geyser(-14, 0, 10)`, `L.geyser(-19, 4, 4)`, `L.geyser(-25, 8, -2)` (period 3, phase 0/1/2, lift 22 ≈ 5.5 m; each terrace is 4 m higher and ≤ 3 m away).
- Kaya Yolu (north): a 4 m wide stepped ramp (boxes 4 × 0.8 m, rise 0.35) from (0, 0, -27) up the north face to (0, 6, -13.6) with 1.5 m side walls; lava boulder `L.enemy('boulder', [0, 7, -13], [0, 0, -29], {every: 5, duration: 3, skin: 'lava'})`; ledge `L.box(5, 7, -13, 3, 3, 1)` at the top.
- Krater: mover `L.mover([-6, 15.5, 4], [6, 15.5, 4], 6)` crossing the pool; coin ring on the rim.
- Eruption spire `L.cyl(0, 24, 4, 2, 11, {mat: 'stone'})` in the pool centre; 7 inner-wall ledges 2.6² spiralling from the rim up around the spire: angle `a = i·0.9`, radius 4.5, tops 16.3 + 1.3·i (i = 0…6) at `(cos a·4.5, ·, 4 + sin a·4.5)`, last ledge → spire top (rise 1.3).
- Secret: cracked crust on the ash beach `L.secret(14, 0, 22, {coins: 12, pound: true})` (pound within 2 m). Heart at (-24, 9, 0).

Crystals:
1. **Lav Gölü** (40, 4.4, -2) — stepping stones over the lava bay (middle stone crumbles), basalt column.
2. **Buhar Bacaları** (-28, 13.4, -6) — three geysers launch you terrace to terrace (sign at (-12, 0, 12): **"Gayzer seni fırlatır — bekle ve bas!"**).
3. **Kaya Yolu** (5, 8.4, -13) — climb the alley; the boulder rolls down every 5 s; jump it two or three times.
4. **Krater** (0, 16.9, 4) — rim → mover over the pool; grab the floating crystal while riding.
5. **Patlama** (0, 25.4, 4) — collecting ④ starts the eruption: toast **"Volkan uyanıyor!"**, music crossfade, lava rises 0.6 m/s (Yardım 0.4) from 13.3 to 21 and stays; spiral up the inner ledges to the spire. **Portal appears on the spire top (0, 24, 4)** when all five are collected (the lava sinks back at 1 m/s). Reset rule: on bus `respawn`/`faint` the lava returns to 13.3 instantly and the eruption re-arms (it restarts when the player next enters the crater trigger box `{x: 0, z: 4, y: 14.5, w: 16, h: 4, d: 16}`), so a faint never soft-locks. Checkpoint on the rim before the climb.

Checkpoints: (2, 0, 22) spawn, (27, 0, -4) east shore, (-15, 0, 12) geyser field, (3, 0, -26) alley foot, (2, 15, 11) rim. Portal: spire top (see ⑤).
Vista: crater rim (0, 15, 11) **"Krater"**. Wow: the eruption climb.

### 2.8 Island 5 — `orman` · Kadim Tapınak (order 5, par 270 s, coins 110)

A jungle village island and a ziggurat temple island across a river. New: **key & door**, **switch + riser (timed)**. Reused: crumble (wood logs), pads, movers. Enemies: 6 bats, 5 slimes, 2 thorn spikies. Music `music_tropical_banana` → `music_mystery_bed` on the temple island (trigger crossfade); ambience `amb_jungle_day` (+ `amb_temple_airy` on the temple).

Layout (≈ 80 × 110 m):
- Village island `L.island(0, 0, 0, 24, 8)` under giant oaks; spawn (0, 0.1, 18) facing −z (the ziggurat is visible north across the river).
- Temple island `L.island(0, 0, -60, 26, 8, {beach: false})`; ziggurat tiers (centred (0, ·, -62)): `L.box(0, 4, -62, 30, 30, 4)`, `(0, 8, -62, 24, 24, 4)`, `(0, 12, -62, 18, 18, 4)`, `(0, 16, -62, 12, 12, 4)`, `(0, 20, -62, 6, 6, 4)` all `mat: {side: 'cliff', top: 'stone'}` (mossy stone wall / cobblestone). Between tiers, 1.4 m steps (3 per tier) on the north-west corners.
- River (10 m): switch `L.switch(4, 0, -8, 'nehir')` (walk-in) raises three river stones (`L.riser`, 2.6², from top −2 to 0.3, 1.5 s) at (0, ·, -26.5), (0, ·, -29.5), (0, ·, -32.5) → temple shore (0, 0, -34). Sign (4, 0, -5): **"Düğmeye bas — taşlar yükselir!"**
- Gate: `L.door(0, 0, -46.5, 4, 0.6, 3.2, 'tapinak')` (large_castle_door prop) at the foot of the first stair notch; crystal ② courtyard on tier 1.
- Ancient oak (-16, 0, -8) scale 1.6 with a root stair (3×3 boxes, rise 1.4): (-12, 1.4, -5), (-14, 2.8, -8), (-16, 4.2, -11), (-18, 5.6, -13), (-19, 7, -16) → canopy `L.box(-17, 8.4, -19, 3, 3, 0.8)`; key `L.key(-17, 9.4, -19, 'tapinak')`.
- Kök Çukuru (open root hollow, replaces the bat cave): floor `L.box(-18, -0.5, 4, 6, 6, 1)` sunk into the village (walls are the island itself ≤ 1.5 m), root_cluster props around; 3 bats circle it.
- Altar puzzle: pound switch `L.switch(4, 16, -62, 'sunak', {timed: 10, pound: true})` on tier 4 (sign on tier 3: **"Havada B ile düğmeye çak!"**); timed risers (`L.riser` from top 15.5 to 17.4 / 18.8, 1 s) at (-5, ·, -58) and (-4, ·, -61) → altar tier 5 (top 20).
- Muz Koyu islet `L.cyl(34, 0, -23, 7, 6)`; stump stones (2.6², rises ≤ 0.5): (26, 0.4, -6), (29, 0.8, -11), (31, 1.2, -16), (33, 1.6, -21) from the village east rim (24, 0, -2); mossy boulder stack `L.box(36, 2, -30, 3, 3, 2)`, `L.box(38, 4, -33, 3, 3, 2)`.
- Log bridge (crumble wood, delay 1.0, respawn 6; dead_tree_trunk_02 skin on a 2.6² box): (33, 1, -36), (32, 1.3, -39.5), (31, 1.6, -43), (30, 1.9, -46.5) → ledge `L.box(28, 2, -49, 4, 4, 3)` in front of the temple's east cliff; waterfall curtain (P1 cosmetic `L.waterfall`) above it.
- Secret: lion_head on the temple's north face at (8, 2, -47); `L.secret(8, 0, -44, {coins: 12, pound: true})` → it spits coins (`temple_mystery_sting`). Heart on Muz Koyu (34, 1, -20).

Crystals:
1. **Kök Çukuru** (-18, 0.9, 4) — under the oak roots among three bats.
2. **Tapınak Kapısı** (0, 5.4, -52) — river switch → stones → key from the oak canopy → the gate slides up (toast **"Kilitli! Anahtar lazım."** if you arrive without it) → tier-1 courtyard.
3. **Tapınak Tepesi** (0, 21.4, -62) — steps to tier 4, pound the switch, two risers for 10 s (Yardım 15), altar.
4. **Şelale** (28, 3.4, -49) — stumps → Muz Koyu → crumbling log bridge → the nook under the waterfall.
5. **Muz Koyu** (38, 5.4, -33) — the mossy boulder stack on the islet, two bats circling.

Checkpoints: (2, 0, 16) spawn, (2, 0, -20) river bank, (0, 0, -38) temple shore, (6, 12, -54) tier 3, (34, 0, -18) Muz Koyu. Portal (-6, 2.5, 20).
Vista: oak canopy (-17, 8.4, -19) facing the misty temple **"Sisli Tapınak"**. Wow: the gate opening, the altar risers.

### 2.9 Island 6 — `gok` · Gökyüzü Takımadaları (order 6, par 240 s, coins 100)

Floating islands over a cloud sea; no water pass (cheapest level). New: **updraft**, **wind**, **orbiter**. Reused: cannon, crumble (cloud), pads ("bounce clouds"). Enemies: 4 birds (bat kind, white), 3 cloud slimes, 1 spiky. Music `music_tropical_dawn`, ambience `wind_sky_loop` + `wind_airy`.

Layout (≈ 100 × 100 × 45 m; every island is `L.cyl` with `taper 0.6` and `rock_face_03` sides so the underside reads as floating rock):
- A hub `L.cyl(0, 0, 0, 9, 6)`; spawn (0, 0.1, 4) facing −z (sees the tower). Tower `L.cyl(0, 34, -14, 3.5, 44, {mat: 'stone'})`.
- Tower updraft `L.updraft(-6, -14, 2.5, -8, 37, {lift: 14})` reached by two planks from the hub's north rim: `L.box(-2.5, 0, -10.5, 2.6, 2.6, 0.5)`, `L.box(-4.5, 0, -12.5, 2.6, 2.6, 0.5)`. Sign (0, 0, -6): **"Rüzgâr sütunu seni yukarı taşır!"**
- A → B: planks `L.box(10.5, 0, 0, 3, 2.6, 0.5)`, `L.box(13.5, 0, 0, 3, 2.6, 0.5)`, bounce cloud `L.bouncePad(15.5, 0.45, 0, 1.2, 27)` (white/pink skin) → B `L.cyl(22, 5, 0, 6, 6)`.
- B → C: updraft `L.updraft(28.5, -4.5, 2.5, -6, 15, {lift: 14})` touching B's rim; C `L.cyl(31, 12, -10, 5, 6)` (its rim is 1 m from the column centre).
- C → D: cannon `L.cannon(33, 12, -12, {to: [18, 18.1, -32], apex: 10})`; D `L.cyl(18, 18, -32, 7, 6)`.
- D → E: crumble clouds (`skin: 'cloud'`, delay 1.2, respawn 5) 2.6² at (8, 18.4, -31), (5, 18.9, -33.5) → E `L.cyl(-2, 20, -36, 6, 6)` carrying the whale (`bronze_whale_statue` scale 7, rotY 0.3; back collider `L.box(-3, 23, -36, 5, 3, 0.6, {noSolid: false})`, fin steps (2, 21.4, -38), (0, 22.4, -37.5)).
- E → F: `L.orbiter` ×2 (3×3, phase 0 / 0.5) around centre (-15, 22.3, -25), r 13, period 16 (clockwise); E top 20 (hop on, rise 2.3), F `L.cyl(-28, 22, -14, 6, 6)` top 22 (walk off). The orbit clears the tower (5.6 m) and every other island.
- F → G: cannon `L.cannon(-30, 22, -12, {to: [-14, 8.1, 22], apex: 6})`; G `L.cyl(-14, 8, 22, 6, 6)` with a 0.6 m rim (4 boxes 12 × 0.6 × 0.6) and a wind zone `L.wind({x: -14, y: 8, z: 22, w: 11, h: 3, d: 11}, [1, 0, 0], 3.5, {gust: 0.6})` (sign at the landing: **"Rüzgâr iter — ona karşı yürü!"**); coins along the downwind rim.
- G → A: descending planks (2.6², drops ≤ 1.5): (-6, 7, 18), (-4.5, 5.5, 14), (-3, 4, 10.5), (-2, 2.5, 7.5) → hub.
- Secret: hollow cloud `L.secret(36, 14, -2, {coins: 10})` on a bounce from C. Heart on D (20, 19, -30).
- `theme.water = null`, `theme.fall = {y: -30, kind: 'cloud'}`: a white `cloud-sea` plane at −35 inside the fog; falling below −30 → **"Bulutlara düştün!"**, −1 heart, respawn at the checkpoint.

Crystals (play order):
1. **Bulut Köprüsü** (22, 6.4, 0) — planks + bounce cloud to B (on-island, no drop-off).
2. **Yıldız Kayası** (31, 13.4, -10) — step off B's rim into the updraft, drift onto C.
3. **Balina Sırtı** (-3, 24.4, -36) — cannon to D, crumble clouds to E, climb the whale's fin.
4. **Gizli Bahçe** (-9.5, 9.4, 22) — orbiters E → F, cannon F → G, walk across the windy garden (the wind pushes toward the crystal).
5. **Rüzgâr Kulesi** (0, 35.4, -14) — the tower updraft from the hub; vista on top. Jump off toward the hub to come down (a miss costs one heart, never progress).

Checkpoints: (2, 0, 3) hub, (22, 5, 2) B, (18, 18, -29) D, (-28, 22, -12) F, (-14, 8, 25) G. Portal (4, 2.5, 5).
Vista: tower top **"Gökyüzü"**. Wow: riding the orbiter past the whale.

### 2.10 Island 7 — `fener` · Fener Adası (order 7, par 300 s, coins 100)

Night finale: light four lanterns, wake the lighthouse, cross to the cove and beat **Kral Pelte**. New: **lantern**, **boss**. Reused as a victory lap: ice, crumble, riser, pads, cannon. Enemies: 5 bats, 4 glowing slimes, 2 spikies, boss. Music `music_calm_night_1` → `music_boss_epic_loop` in the arena; ambience `amb_rainforest_night` + `amb_waves` (−8 dB).

Layout (≈ 100 × 80 m):
- Meadow `L.island(0, 0, 0, 30, 8)`; spawn (0, 0.1, 20) facing −z. Keeper's cottage (plank boxes) at (-6, 0, 12); secret behind it `L.secret(-9, 0, 9, {coins: 12})`.
- Lanterns (`L.lantern`, walk-in): L1 (0, 0, 16) spawn, L2 (16, 0, 6) mushroom grove, L3 (-6, 0, -22) bowl hill, L4 (-12, 0, -10) lighthouse base. Sign (0, 0, 18): **"Dört feneri yak — fener kulesi uyansın!"** HUD shows `🏮 n/4`.
- Lighthouse `L.cyl(-16, 18, -10, 3, 18, {mat: 'stone'})` with 12 spiral ledges (2.6², rise 1.4, radius 5.2, angle 0.6·i) like kristal's tower; gallery ring `L.cyl(-16, 18, -10, 4.5, 0.6, {mat: 'stone'})`; lamp switch `L.switch(-16, 18.6, -10, 'lamba', {pound: true})` (sign on the gallery: **"Lambaya havada B ile vur!"**).
- Yıldız Yolu (west): stones 2.6² from the west shore (-30, 0, -14): (-33, ·, -15) **riser** (from −3 to 0.4 on `switch:lamba`), (-36.5, 0.6, -16) **crumble rock** (delay 1.0), (-40, ·, -17) **riser** → sea rock `L.cyl(-45, 1, -18, 3, 4)`. Before the lamp is lit the risers are under the sea; after, the beam (cosmetic `SpotLight` cone rotating 0.3 rad/s, high/medium only) sweeps and the stones have emissive rims.
- Mantar Korusu: mushroom bounce pads (27): (16, 0.45, 8) → ledge `L.box(18, 5, 5, 3, 3, 0.8)`; pad (18, 5.45, 5) → treehouse `L.box(20, 8, 2, 3, 3, 0.8)`.
- Yıldız Çukuru (open bowl, replaces the shaft): hill `L.cyl(6, 4, -24, 6, 4)`; rim: 4 boxes 6 × 1.5 top 5.5 around it with a 2 m gap on the south; stair up the hill's east side (1.4 rises); the bowl floor is `L.ice` (sliding fun, rim keeps you in); coin ring + heart inside.
- Cove arena islet `L.cyl(38, 0.5, -31, 8, 4)`; riser stones (2.6², from −3 to 0.3 on `lantern` count 4) at (25, ·, -22), (28, ·, -25) from the meadow's east shore (22, 0, -19); gallery cannon `L.cannon(-14, 18, -8, {to: [38, 0.6, -31], apex: 8, locked: 'lanterns'})` (toast **"Fenerler yanınca ateşlenir."** while locked) as the fast way.
- When all four lanterns are lit: fireflies stream from each lantern to the cove (particle system target), the riser stones rise, the cannon unlocks, Kral Pelte lands on the arena (`boss_roar_1`), music crossfades.

Crystals:
1. **Deniz Feneri** (-16, 19.4, -10) — climb the spiral, pound the lamp (the only pound switch on the island, signposted).
2. **Yıldız Yolu** (-45, 2.4, -18) — the beam-lit stones: riser, crumble, riser, sea rock.
3. **Mantar Korusu** (20, 9.4, 2) — glowing mushroom pads up to the treehouse.
4. **Yıldız Çukuru** (6, 5.4, -24) — up the hill, drop into the icy bowl among circling bats, leave by the south gap.
5. **Kral Pelte** (38, 1.9, -31) — light L1–L4, cross to the arena, beat the boss (3 HP; §3.11). The crystal drops where he bursts; **the portal opens on the arena (38, 0.5, -28)** → credits with the Kartpostal gallery.

Checkpoints: (2, 0, 18) spawn, (-12, 0, -6) lighthouse base, (-16, 18, -6) gallery, (14, 0, 4) grove, (24, 0, -20) east shore, (38, 0.5, -24) arena (set when the boss lands).
Vista: lighthouse gallery **"Fener Işığı"**. Wow: four lanterns → fireflies stream across the dark sea → the boss lands.

---

## 3. Engine primitives

Every primitive is a module `src/engine/mechanics/<name>.js` exporting `install(L, ctx)` (ARCHITECTURE §7), registered in
`mechanics/index.js`. Only box/cylinder colliders. Yardım Modu multipliers come from `physics.assist` (§3.0).

### 3.0 Small engine additions (do these first; ≈ 150 lines total)

| # | Where | Change |
|---|---|---|
| E1 | physics.js | `setSolid(c, on)`: toggles `c.noSolid`, adds/removes `c.mesh` in `solidMeshes` (camera + blob shadow ignore it), and if re-solidifying while the player's feet are inside the collider sets `player.pos.y = top`. Export on `physics`. |
| E2 | physics.js | `player.fallCap` (default `MAX_FALL`); gravity line uses `-(p.fallCap)`. Cannon sets it to 120 during a flight. |
| E3 | physics.js | `fellInWater()` branches on `sim.waterKind` (`'water'` default, `'lava'` → `hazard('lava')` with the splash replaced by `lava_bubble_pop`, toast **"Cız! Lav!"**, `'cloud'` → toast **"Bulutlara düştün!"**, `whoosh_dash_1`). `world.load` sets `sim.waterY/waterKind` from `theme.water` or `theme.fall` (`waterY = fall.y`). |
| E4 | physics.js | `physics.assist = { on: false, coyote: 0.1, enemySpeed: 1, crumble: 1, wind: 1, timed: 1, coinLoss: true, hearts: 3 }`; `COYOTE` read through it; `faint()` skips the coin loss when `!coinLoss`; `player.maxHearts = assist.hearts` on `reset`. |
| E5 | camera.js | `cam.auto` (setting, default true on touch): when `performance.now() - cam.lastLook > 1200` and the player moves, ease `cam.yaw → player.facing + π` with rate 2.5. `cam.suggest = { yaw, until }` set by `L.trigger` areas (`L.camHint(box, yaw)`) takes precedence while the right thumb is idle. `cam.override = { yaw, pitch, dist, t }` for vistas/boss intro (HUD hidden). |
| E6 | world.js | movers accept `fn(t) → Vector3` (`m.fn`) instead of a↔b (orbiter/bob/path); `L.mover` unchanged. |
| E7 | assets.js | GLB post-process: any material with `transmission > 0` is replaced by `MeshStandardMaterial({color, emissive: 0xffd080, emissiveIntensity: 0.6})` (Lantern_01). HDRI loader prefers `_1k` on medium/low. |
| E8 | core.js | small objects (coins, flowers, particles, enemies, crystals) on `layer 2`; the Water mirror camera uses layers `{1}` only; reflection updated every 2nd frame on medium; shadows **off** on low (`renderer.shadowMap.enabled = false`, blob shadow stays). GL-wrapped draw counter exposed as `core.stats().glDraws` (wrap `gl.drawElements/drawArrays/…Instanced` in `?debug=1`/`?test=1`). |
| E9 | save.js | schema v2 additive (§4.4). |
| E10 | bus | mechanics subscribe to `respawn`, `faint`, `pound`, `level:unloaded` for resets. |

### 3.1 `L.crumble(c, opts)` — a platform that shakes, breaks, falls and comes back

- **Behaviour**: while stood on, it wobbles (0.03 m sideways sine, amplitude grows with time) and plays `platform_crack_warn` at `delay − 0.5`; after `delay` s it breaks (`setSolid(false)`, mesh falls with `y -= 8·t·dt` and scales to 0.3, invisible after 1 s, skin sfx), after `respawn` s it pops back (scale 0 → 1 in 0.3 s, `cartoon_rise_short`). Leaving it before `delay` lets the timer decay at 2×.
- **Params**: `{ skin: 'wood'|'ice'|'rock'|'cloud' = 'rock', delay: 1.0, respawn: 5 }`; effective delay `× physics.assist.crumble`.
- **Collider**: the given box/cyl (the mechanic only toggles solidity).
- **Sfx by skin**: wood `wood_break`; ice `ice_crack_short` → `ice_break_1`; rock `rock_crumble_1/2/3` round-robin; cloud `bubble_pop_designed`. Particles: skin colour burst 14.
```js
c.t = 0; c.onStand = (p, c, dt) => { c.t += dt; c.mesh.position.x = c.x + Math.sin(c.t * 60) * 0.03 * c.t;
  if (!c.warned && c.t > D - 0.5) { c.warned = true; L.sfx('platform_crack_warn'); }
  if (c.t > D) breakNow(); };
c.onLeave = () => { c.leaving = true; };
L.dynamic({ update(dt) { if (c.leaving && !c.broken) { c.t = Math.max(0, c.t - 2 * dt); if (c.t === 0) { c.leaving = false; c.warned = false; } }
  if (c.broken) { c.fallT += dt; c.mesh.position.y -= 8 * c.fallT * dt; c.mesh.visible = c.fallT < 1; if (c.fallT > R) restore(); } } });
function breakNow() { c.broken = true; c.fallT = 0; physics.setSolid(c, false); L.sfx(SKIN[skin].sfx); L.spawnParticles(c.mesh.position, 14, SKIN[skin].color); }
function restore() { c.broken = false; c.t = 0; c.warned = false; c.mesh.position.set(c.x, c.y0, c.z); c.mesh.visible = true; physics.setSolid(c, true); popIn(c.mesh); L.sfx('cartoon_rise_short'); }
```

### 3.2 `L.ice(c)` — slippery surface
- **Behaviour**: sets `c.surface = 'ice'` (`SURFACES.ice = {acc: .22, dec: .1, speed: 1.15}` already exists). Marble top material if the box has none. Audio: `ice_skate_glide` loop with gain `clamp(speed / 9)` while grounded on ice; `ice_skate_scrape` when the wish direction flips (dot < −0.5). Foot particles white. ≈ 30 lines.

### 3.3 `L.lava(x, top, z, w, d, opts)` — glowing pool that burns
- **Behaviour**: visual plane (ShaderMaterial: two scrolling noise octaves mixing crust `rock_boulder_cracked` and emissive orange; **low tier**: `MeshBasicMaterial` with the crust texture + emissive scroll) + bubble particles; a `L.trigger({x, z, y: top − 1, w, h: 1.25, d}, {onEnter: () => physics.hazard('lava')})`. Returns `{ mesh, trigger, setLevel(y) }` (eruption moves both).
- **Params**: `{ color: 0xff5a1f, glow: 0xffb060, speed: 0.08 }`. **Collider**: trigger only (noSolid); a `surface:'lava'` floor under it is optional. Sfx: hazard plays `fire_crackle_loop` 0.4 s + `lava_bubble_pop`.
- Theme-level lava sea: `theme.water = {kind: 'lava', …}` → `core.setWater` builds the same material as a 900 m plane (no reflection pass); E3 handles the fall.

### 3.4 `L.cannon(x, top, z, opts)` — hop in, boom, ballistic flight, exact landing
- **Behaviour**: walking into the barrel trigger (cyl r 1.2) locks input, tweens Pıtır into the mouth (0.5 s, `cannon_01` barrel yaws/pitches toward `to`), 0.6 s fuse (barrel shake, `timer_tick`), then `cannon_launch` + `whoosh_rise`, smoke ring burst, `addTrauma(0.3)`, `cam.yaw` snaps to the flight direction; a `coinArc` is placed on every flight by the level. No air control during the flight (`controlLock`), landing exactly on `to` (feet).
- **Params**: `{ to: [x, y, z], apex: 8 (m above the mouth, must be ≥ dy + 1), locked: signalId|null, rotY }`.
- **Collider**: decorative cyl base r 1.2 h 1.4 + trigger cyl r 1 above it.
- **Physics** (asymmetric gravity, verified against `FALL_MULT`):
```js
const mouth = [x, top + 1.4, z], dy = to[1] - mouth[1];
const tUp = Math.sqrt(2 * apex / GRAV), tDown = Math.sqrt(2 * (apex - dy) / (GRAV * FALL_MULT)), T = tUp + tDown;
const vx = (to[0] - mouth[0]) / T, vz = (to[2] - mouth[2]) / T;
player.fallCap = 120; player.controlLock = T + 0.15; player.pos.set(...mouth);
physics.launch(new THREE.Vector3(vx, GRAV * tUp, vz)); player.flying = true;
cam.yaw = Math.atan2(-vx, -vz);               // camera behind the flight
L.dynamic({ update() { if (player.flying && player.grounded) { player.flying = false; player.fallCap = MAX_FALL; player.controlLock = 0; } } });
```
  `controlLock` also disables the jump-hold apex hang (`g *= 0.6` only when `!locked`) so the solve is exact; `extVel` is zeroed at launch. Landing speed may exceed 32 m/s (squash is clamped at 30 already).

### 3.5 `L.wind(box, dir, speed, opts)` and `L.updraft(x, z, r, y0, y1, opts)` — one module `wind.js`
- **Wind (horizontal)**: box volume; while inside, `extVel` is eased toward `dir·speed·gust(t)`; the engine's airborne decay (1.2 %/step) leaves an effective push ≈ 0.87·speed. `speed ≤ 4` (level rule) `× physics.assist.wind`. Visual: one `InstancedMesh` of 24 streaks moving along `dir`. Sfx: `wind_strong` gated by the gust envelope, `wind_howl_loop` gain by strength.
```js
onStay: (p, tr, dt) => { const g = gust ? 0.5 + 0.5 * Math.sin(t * gust * 2 * Math.PI) : 1;
  target.copy(dir).multiplyScalar(speed * g * physics.assist.wind);
  p.extVel.lerp(target, 1 - Math.exp(-10 * dt)).clampLength(0, speed); }
```
- **Updraft (vertical)**: cylinder volume `{x, z, r, y0, y1}` (not a collider); while inside, `p.vel.y = damp(p.vel.y, lift, 6, dt); p.grounded = false; p.pounding = false` — gravity is still integrated, so `lift 14` climbs at ≈ 6.5 m/s; above `y1` the player arcs over normally (air control on). Visual: rising streak column + `wind_howl_loop` gain by height inside; `spring_boing` once on entry.
- **Params**: wind `{gust: 0.6 Hz | 0}`; updraft `{lift: 14}`.

### 3.6 `L.orbiter(center, r, period, opts)` / `L.bob(c, amp, period, opts)` / `L.pathMover(fn, w, d)` — movers on a function
- All three create a `L.mover` box and set `m.fn`: orbiter `fn = t => center + [cos a·r, 0, sin a·r]`, `a = phase·2π + t/period·2π·(cw ? −1 : 1)`; bob `fn = t => [x, y0 + sin(t/period·2π + phase)·amp, z]`; pathMover takes any `fn`. `world.step` computes `delta` as today, so riders are carried. **Params**: `{w: 3, d: 3, phase: 0, cw: true, stopped: false}`; `m.stopped = true` freezes it (fener orbiters are not used; kept for parity). Sfx: none (`bubble_pop` on bob crest optional).

### 3.7 `L.switch(x, top, z, id, opts)` / `L.riser(c, dy, dur, id)` / `L.key(x, y, z, id)` / `L.door(x, top, z, w, d, h, id)` / `L.lantern(x, z, id)` — one module `signals.js`
- **Switch**: cyl r 0.8 h 0.35 (stone button); pressed on `onLand` (walk-in) — with `{pound: true}` only when `player.pounding` at landing (the hook fires before `onPoundLand` clears it). Pressed: button sinks 0.25, `switch_click_bright`, `world.emit('switch', id, true)`. `{timed: s}`: after `s × assist.timed` seconds emits `false`, button pops up; `timer_tick` for the last 3 s; re-pressable.
- **Riser**: tweens `c.min.y/max.y/mesh.y` by `dy` over `dur` s on `switch`/`lantern` signal `id` (back down on `false`), writing `c.delta` each step so riders are carried; `lever_gate` while moving; a riser whose top stays under the sea is simply underwater (no special case).
- **Key**: collectible like a crystal (gold key mesh, bob + spin); on pickup `key_pickup` + `key_jingle_foley`, HUD `🔑`, the key mesh follows Pıtır at offset (0, 2, 0) with lag 6; `player.keys.add(id)`. Lost on `faint` → respawns at its origin (`world.emit('key', id, false)`).
- **Door**: box collider + `large_castle_door` prop; `onBonk(side)` with the key → `door_unlock`, tween up `h + 0.3` over 1.2 s, then `setSolid(false)`, key consumed; without → `door_lock_click` + toast **"Kilitli! Anahtar lazım."** (throttled 2 s).
- **Lantern**: a walk-in switch at the base of a `Lantern_01` prop (collide cyl r 0.5); on press: lantern emissive 2, glow sprite, one of the ≤ 3 pooled `PointLight`s is assigned to the lit lanterns nearest the player each frame, `switch_toggle` + `star_wand_ping` + `fire_crackle_loop` 1 s, `world.emit('lantern', id, true)` and `world.emit('lanterns', 'count', litCount)`; HUD `🏮 n/N`.

### 3.8 `L.geyser(x, top, z, opts)` — a launcher, not a burn
- **Behaviour**: cyl trigger r 1.3, h 2.5 (noSolid) on a stone vent; cycle `period` s: 0.6 s telegraph (bubbles, `bubbles_pop_asc`, column scale 0.3 → 0.6) then 0.8 s eruption (steam column scale 6, `whoosh_rise`); if the player is inside during the eruption and `vel.y < lift`: `physics.launch([vel.x, lift, vel.z])` once per eruption (air control stays on, no lock).
- **Params**: `{period: 3, phase: 0, lift: 22}` (22 ≈ 5.5 m; terraces are +4 m).

### 3.9 `L.vista(x, y, z, opts)` and `L.secret(x, y, z, opts)` — wonder and curiosity
- **Vista**: trigger box 3 × 2 × 3; first entry per level run: HUD hides, touch layer hides, `cam.override` tweens to `{yaw, pitch, dist}` over 2.5 s (input ignored, `controlLock`), toast the title with a 📷 chip, `medal_fairy_dust`; `save.patch(levels[id].vista = true)` → Kartpostal chip on the map. Returns the trigger. (P2: capture a 320 × 200 JPEG right after `render()` into `pitir.postcards.v1`.)
- **Secret**: `L.trigger` 3 × 2 × 3, `once`; `{coins: n, r: 2, pound: false}` — on enter (or, with `pound`, on bus `pound` within 2 m) spawns `L.coinRing` of `n` coins with a `temple_mystery_sting` and toast **"Gizli hazine!"**; `levels[id].secret = true`. Coins from a secret **do count** toward `coinsTotal` (they are placed at build with `taken = false, hidden = true`), so the coin star needs the secret: this is intentional — the star means "explored everything".

### 3.10 `L.heart(x, y, z)` — +1 heart (cap `maxHearts`), `heart_pickup_1`, pink burst; respawns never.

### 3.11 `L.boss(x, y, z, opts)` — Kral Pelte (≈ 180 lines, `boss.js`, registered as enemy kind `boss`)
- **Visual**: a 2.2 m slime (same build as `slime` ×3.5) with a crown; collider cyl r 2 h 2.2 (`touch: 'hurt'`, stompable only while dizzy).
- **State machine** (arena r 8, player always inside): `intro` (lands from above, `boss_roar_1`, cam override 2 s) → `idle` 1.0 s (`slime_big_growl`) → `telegraph` 0.8 s (squash to 0.7, eyes narrow, `boss_grunt`) → `hop` (ballistic 1.1 s onto the player's position at telegraph start, same asymmetric solve as the cannon) → `slam` (hit-stop 0.06, trauma 0.5, `boss_footstep`; shock ring expands 0 → 7 m over 1.6 s (≈ 4.4 m/s; Yardım 2.2 s); `if (|hd − ring.r| < 0.6 && p.y < base + 0.8) hazard('spike')`) → `dizzy` 2.5 s (stars over head, `stompable = true`) → `idle`. Stomp while dizzy: `hp--`, `boss_grunt`, scale ×0.85, hop speed ×1.15; at 2 HP spawns 2 slimes; at 0 HP: 60-particle burst, `boss_laugh_1` fading, `level_complete_trumpets`, `L.crystal` at `(x, y + 1.4, z)`, portal placed. `hp: 3` (Yardım 2). Telegraph ≥ 0.8 s and the ring speed satisfy §2.0.

### 3.12 Enemy kinds (`enemies.register`, ≈ 40 lines each, in `enemies.js`)
- **crab** `L.enemy('crab', a, b, {speed: 2.4})`: side-steps a↔b with 0.6 s pauses, faces sideways, claws snap (`enemy_hit_bounce` on stomp); stompable, hurt on touch.
- **bat** `L.enemy('bat', home, {r: 4, h: 1.5, skin: 'bat'|'bird'})`: circles `home` at radius r, height `h + 0.3·sin`, swoops toward the player when < 6 m (speed 4) and returns; stompable, poundable, `cartoon_rise_short` on swoop. Bird skin: white, used on `gok`.
- **boulder** `L.enemy('boulder', a, b, {every: 5, duration: 3, r: 1.1, skin: 'snow'|'lava'})`: appears at `a` every `every` s (`rock_landslide` 0.3 s before), rolls to `b` in `duration` s (rotation = distance / r), bursts at `b` (`rock_crumble_2` / splash), untouchable, hurt on contact (`hazard('spike')`), jumpable. `spiky_roll_loop` gain by distance. Speeds `× assist.enemySpeed`.

Total new primitives: 11 (crumble, ice, lava, cannon, wind/updraft, orbiter/bob/path, signals (switch/riser/key/door/lantern), geyser, vista/secret, heart, boss) + 3 enemy kinds. Everything else the levels use already exists (`box, cyl, island, mover, bouncePad, coin*, crystal, checkpoint, portal, slime, spiky, tree, rock, prop, scatter, sign, light, trigger, dynamic, remove`).

---

## 4. Level system & meta

### 4.1 Flow
`Başla` → **Harita** (level select) → island (2 s fly-in + **"Hazır… Başla!"**, skippable) → win card → `Sonraki Ada` / `Tekrar` / `Harita`.
First launch: the Harita opens with only Kristal Adası unlocked and a pulsing **"Buradan başla!"** label. After `fener`: credits (asset credits from `assets/CREDITS.md` + the Kartpostal gallery).

### 4.2 Harita (level select) — replaces `#selectScreen` content, same ids where they exist
- A cream parchment card over the live sea (the last-played island keeps idling behind it). Inside: an inline SVG dotted route with seven round **island badges** placed by a `LAYOUT` table (`{id, x%, y%}`), each in its own sky colour with a silhouette icon (tower / palm+sun / snow peak / volcano / ziggurat / cloud+whale / lighthouse). Narrow phones (`max-width: 640px` landscape): badges become a horizontally **snap-scrolling** row.
- DOM: `ul.levels#levelList > li.level-card[data-id][data-locked]` with `.lv-icon`, `.lv-name`, `.lv-stars` (★★★, grey when unearned), `.lv-best` ("En iyi 2:41 · 🪙 80/95"), `.lv-medal` (Altın/Gümüş/Bronz chip), `.lv-chips` (📷 Kartpostal, 🔍 Gizli), a padlock + "Yakında" for not-built nodes.
- Tap a badge → side panel `#levelDetail`: name, subtitle, par time, the three star criteria with ticks, **Günün Görevi** ribbon (P1), big gold **"Başla!"** `#playBtn`. Locked: toast **"Önce <ada> adasını kurtar"** + `ui_negative_blip`.
- Bottom bar: **Dolap** (cosmetics), **Ayarlar**, **Krediler**. Sounds: `ui_click`, `ui_hover_1`, `ui_back`, `ui_open`; music `music_menu_cheeky_monkey`, ambience `amb_waves`.

### 4.3 Stars, medals, unlocks
- Stars (unchanged `save.levelResult`): ★ finished · ★ all coins (`coins ≥ coinsTotal`) · ★ time ≤ par. Crystals are mandatory and never score; Kartpostal and the secret are chips, never stars.
- **Medals** derived from `bestTime` (no schema change): Altın ≤ par, Gümüş ≤ 1.35 × par, Bronz ≤ 1.8 × par.
- Unlock: linear by `order` (`ensureUnlocks`); stars are never a gate. `kanyon` (bonus) unlocks at 15 ★ when built.
- **Yardım Modu** runs disable the time star for that run and show a "yardım" badge on the card (the record is kept separately: `bestTimeAssist`).

### 4.4 Save — `localStorage['pitir.save.v1']`, schema `v: 2` (additive migration from v1)
```js
{ v: 2, createdAt, updatedAt, wallet: 0,
  cosmetics: { owned: ['none', 'scarf:4dabf7'], hat: 'none', scarf: 0x4dabf7 },
  settings: { mute: false, music: true, musicVol: 0.6, sfxVol: 0.9, quality: 'auto', qualityAuto: null, invertY: false,
              hints: true, assist: false, autoCam: true, camSens: 1.0, simpleTouch: false, leftHanded: false, reduceShake: false },
  levels: { [id]: { unlocked, done, bestTime, bestTimeAssist: null, bestCoins, stars, crystals, vista: false, secret: false, attempts: 0 } },
  stats: { playTime: 0, jumps: 0, stomps: 0, faints: 0, wins: 0 },
  flags: { seenIntro: false, seenTouchTutorial: false, assistOffered: false },
  daily: { date: null, levelId: null, mod: null, done: false } }
```
Write on win, vista, secret, settings change, purchase, and `visibilitychange`/`pagehide` (debounced 1 s otherwise). Postcard JPEGs (P2) live under a separate key `pitir.postcards.v1` so the main object stays < 10 KB. In-memory fallback stays.

### 4.5 Win screen (`#winScreen`) — "Ada Kurtarıldı!"
Portal iris (white iris with the rainbow rings) → card: stars pop one by one (`star_jingle_1`, `star_jingle_2`, `medal_glissando` on 3★), time vs par (⏱ 2:41 / 3:30) with the medal chip, coins x/y, **"Yeni rekor!"** badge (`bonus_warm_10`), Kartpostal chip, `+coins` flying into the wallet counter (`coin` ticks), `level_complete_kids`. Buttons `#nextBtn` **Sonraki Ada** (primary; hidden after `fener`), `#againBtn` **Tekrar**, `#levelsBtn` **Harita**.

### 4.6 Pause (`#pauseScreen`)
**Devam** · **Baştan** · **Harita**; Ses / Müzik toggles (existing `#optMute/#optMusic`), **Yardım Modu** toggle (applies on the next respawn), `pause_in/out`, `pause_music_loop`.

### 4.7 Ayarlar
Efekt / Müzik sliders · Kalite (Otomatik/Yüksek/Orta/Düşük; shows the detected tier) · Kamera hızı · Kamera otomatik · Y ters · Basit dokunma · Solak düzen · Titreme azalt · İpuçları · **Yardım Modu** · İlerlemeyi sıfırla (two taps) · Krediler.

**Yardım Modu** (must-have): 5 hearts, no coin loss on faint, enemy/boulder speed ×0.75, crumble delay ×1.5, wind ×0.7, timed switches ×1.5, eruption rise ×0.65, coyote 0.18 s, boss 2 HP + slower ring; time star off + badge. Offered automatically once after the third faint on the same island: toast with a button **"Yardım Modu'nu açalım mı?"**.

### 4.8 Pıtır'ın Dolabı (cosmetics, small)
Wallet = coins banked on wins. Items rendered procedurally on `pSpin` (≤ 15 lines each), previewed live on the menu Pıtır:
scarf colours ×4 (kırmızı, yeşil, mor, sarı) 30 each · hats: **Yaprak Taç** 120, **Korsan Şapkası** 150, **Kar Beresi** 150, **Fener Şapkası** 200 (tiny lantern, emissive). Total ≈ 740; a full three-star campaign banks ≈ 680 + daily rewards → one replay buys everything. `power_up` on purchase. Save `cosmetics.{owned, hat, scarf}`.

### 4.9 Günün Görevi (P1, offline)
Seed `YYYYMMDD` → pick an unlocked island + modifier (`par −15 %` / `≥ 90 % coins` / `no hearts lost`); reward 100 coins + a stamp on the badge; `save.daily`.

### 4.10 Feel layer
Level start fly-in (camera from 40 m above the first objective to the spawn, 2 s, skippable) + **"Hazır… Başla!"**; checkpoint flag raise + HUD gem slots fill (`checkpoint`); sparkle trail toward the nearest uncollected crystal after 45 s without progress (hints on); portal iris; 25-coin `one_up` jingle; `vibes_descend` on faint.

### 4.11 Tutorial signposts (all `L.sign`, Turkish)
| island | text |
|---|---|
| kristal | "Zıpla! (A — basılı tut: daha yükseğe)" · "Koşarken üst üste 3 kez zıpla!" · "Havada B: yere çakıl!" · "Zıplama yastığı: üstüne bas!" |
| kumsal | "Topun içine gir — Pıtır uçar!" · "Şamandıralar sallanır — zamanla!" |
| kar | "Buz kaygan! Erken dön." · "Kartopu geliyor — üstünden zıpla!" · "Çatlayan buz: hızlı geç!" |
| volkan | "Lav yakar! Sadece taşlara bas." · "Gayzer seni fırlatır — bekle ve bas!" |
| orman | "Düğmeye bas — taşlar yükselir!" · "Anahtarı bul, kapıyı aç." · "Havada B ile düğmeye çak!" |
| gok | "Rüzgâr sütunu seni yukarı taşır!" · "Rüzgâr iter — ona karşı yürü!" |
| fener | "Dört feneri yak — fener kulesi uyansın!" · "Lambaya havada B ile vur!" |

---

## 5. Mobile

### 5.1 Touch controls (`src/engine/touch.js`, from `docs/research/mobile-readiness.md` §2 — implement that code)
- Left half: dynamic virtual stick (origin at the first touch, ring follows the finger, 12 % dead zone, radius `clamp(16vh, 48px, 96px)`). Right half: drag = orbit (`SENS = π·1.1 / innerWidth`, pitch ×0.8, clamped [−0.15, 1.25]); buttons **A** jump (`clamp(56px, 17vmin, 96px)`, hold = `jumpHeld`, each `pointerdown` = `jumpPressed`) and **B** pound (0.72 × A, up-left of A); pause 44 × 44 by the timer. Every pointer id has one role; `setPointerCapture`; `pointercancel/visibilitychange/blur` release everything.
- **Basit mod**: a tap anywhere on the right half jumps, a drag (> 12 px) orbits. **Solak**: mirrored layout. `cam.auto` default on for touch. Vistas hide the layer. `navigator.vibrate(6)` on button press.
- Portrait: full-screen prompt **"Telefonu yan çevir 📱↻"** (game paused). Safe-area insets on HUD and cards; cards scroll (`.overlay {overflow: auto}`, `.card {max-height: 100%}`); all targets ≥ 44 px; first play shows the stick/A/B overlay once (`flags.seenTouchTutorial`).

### 5.2 Quality tiers (GL-wrapped draw budget; `renderer.info` undercounts 3–6× because Water.js's nested render resets it)
| | high | medium | low |
|---|---|---|---|
| DPR cap | 1.5 | 1.25 | 1.0 |
| shadows | 2048 PCFSoft | 1024 PCF, casters = solids + trees + player + enemies | **off** (blob only) |
| water | Water.js 512², every frame | 256², every 2nd frame, mirror skips layer 2 | flat normal-map plane |
| HDRI | 2k | 1k | 1k (env only) + gradient sky |
| textures | 1k | 1k diffuse / 512 normal+ARM | 512, no terrain normal maps |
| props / particles | maxProps 400 / 300 | 250 / 150 | 120 / 60 |
| point lights | 3 | 3 | 2 |
| fog | theme | theme | ×0.7 |
| draw budget | ≤ 900 | ≤ 500 | ≤ 250 |
Detection as today plus the runtime probe (avg dt > 22 ms over the first 180 frames → step down at the next level load, stored in `settings.qualityAuto`). Instance coins (one `InstancedMesh` per level, hidden instances scaled to 0), kit props via `L.scatter`, flowers already instanced.

### 5.3 What ships in `www/` (target ≤ 60 MB; today assets/ is 141 MB)
- `vendor/three` r186 (present). No CDN, no import-map dependency at ship time (esbuild bundle `dist/game.js` for Capacitor; dev keeps the import map).
- HDRIs: **1k only** for the 7 themes (drop the 2k copies and `qwantani_*`, `sky_2k` from the bundle; keep the alias table).
- Textures: the 23 sets re-encoded to 512 px WebP for mobile (`tools/convert-any.mjs`), 1k JPG for the web/high build.
- Models: kit (4 MB) + hero props optimised by `tools/optimize-glb.mjs` (≈ 6 MB total).
- Sounds: only the keys referenced in §6 (≈ 95 files ≈ 17 MB); `assets/sfx/manifest.json` trimmed by `tools/build-manifest.mjs --used`.
- Core pack + one theme pack per level loaded on demand (`assets.ensureTheme(theme)` before `build`), with a loading card (**"Ada hazırlanıyor…"**) that also pre-compiles shaders (`renderer.compile`).

---

## 6. Audio (all keys verified present in `assets/sfx/manifest.json`)

### 6.1 Per island
| island | music | ambience | island one-shots / loops |
|---|---|---|---|
| Harita / menus | music_menu_cheeky_monkey | amb_waves | ui_click, ui_hover_1, ui_back, ui_open, ui_negative_blip (locked), power_up (purchase) |
| kristal | music_island_loop | amb_waves + amb_birds | step_grass_1–4 |
| kumsal | music_tropical_steel | amb_waves + wind_breeze | step_sand_1–3 + step_sand_dry, cannon_launch + whoosh_rise, timer_tick (fuse), bubble_pop (bob crest), key_pickup_twinkle (chest), enemy_hit_bounce (crab) |
| kar | music_winter_dance | snow_wind_loop_1 (quiet); snow_blizzard_amb on the summit (trigger) | step_snow_1–4, ice_skate_glide / ice_skate_scrape, ice_crack_short → ice_break_1/2, spiky_roll_loop + rock_landslide (snowball), ice_melt (floe respawn) |
| volkan | music_space_race → music_boss_epic_loop (eruption) | lava_flow_loop + lava_bubbles_loop + lava_rumble_loop | step_stone_1–4, platform_crack_warn → rock_crumble_1/2/3, lava_bubble_pop + fire_crackle_loop (burn), bubbles_pop_asc + whoosh_rise (geyser), spiky_roll_loop + rock_landslide (boulder) |
| orman | music_tropical_banana → music_mystery_bed (temple) | amb_jungle_day; + amb_temple_airy on the temple island | key_pickup + key_jingle_foley, door_unlock, door_lock_click, switch_click_bright, lever_gate (risers), timer_tick, wood_break (logs), temple_mystery_sting + temple_twinkle (secret), cartoon_rise_short (bat swoop) |
| gok | music_tropical_dawn | wind_sky_loop + wind_airy | wind_howl_loop (updraft gain by height), wind_strong (gusts), spring_boing (updraft entry), bubble_pop_designed (cloud crumble), cannon_launch |
| fener | music_calm_night_1 → music_boss_epic_loop (arena) | amb_rainforest_night + amb_waves (−8 dB) | switch_toggle + star_wand_ping + fire_crackle_loop (lantern), lever_pull_long + power_up (lamp), medal_fairy_dust (bowl), boss_roar_1 (intro), slime_big_growl (idle), boss_grunt (telegraph/hit), boss_footstep (slam), boss_laugh_1 (defeat), level_complete_trumpets |

### 6.2 Global events → keys
jump (chain 1/2/3 pitch up) `jump` · coin `coin` · 25 coins `one_up` · stomp `stomp` · hurt `hurt` · bounce pad `bounce` · pound `pound` · land `land` · water `splash` · lava `lava_bubble_pop` · cloud fall `whoosh_dash_1` · crystal `crystal` · checkpoint `checkpoint` · heart `heart_pickup_1` · portal open `portal` · win `level_complete_kids` → `star_jingle_1/2` → `medal_glissando` (3★) · new record `bonus_warm_10` · faint `vibes_descend` · pause `pause_in/out` + `pause_music_loop` · sign open `ui_hover_2` · vista `medal_fairy_dust` · secret `temple_mystery_sting` · footsteps by `theme.materials.ground.steps` role (grass/sand/stone/snow). Music loops crossfade 0.5 s; island crossfades (temple, eruption, arena) 2 s.

---

## 7. Build order

### P0 — must ship now (≈ 2 engineer-days; one agent per island on day 2)
- [ ] §3.0 engine additions E1–E10 (`setSolid`, `fallCap`, waterKind/fall, assist table, `cam.auto/suggest/override`, mover `fn`, Lantern glass swap + 1k HDRI preference, layer 2 + reflection cadence + shadows off on low + GL draw counter, save v2, bus resets)
- [ ] Mechanics in this order: crumble → ice → lava (+ lava sea) → cannon → wind/updraft → orbiter/bob → signals (switch/riser/key/door/lantern) → geyser → vista/secret → heart; enemies crab, bat, boulder
- [ ] `touch.js` (full §5.1), portrait prompt, safe-area/scroll fixes, 44 px targets, `cam.auto`, basit mod
- [ ] Harita (badges + detail panel), medals, win card additions, pause additions, Ayarlar incl. **Yardım Modu**, fly-in + "Hazır… Başla!", 45 s sparkle guide
- [ ] `kristal` polish (signs, kit trees, secret, vista, heart)
- [ ] Downloads + optimise + credit: cannon_01, ocean_buoy, treasure_chest, moon_rock_02/04/06, large_castle_door, lion_head, gothic_statue, fern_02, bronze_whale_statue, wooden_lantern_01, dead_tree_trunk_02
- [ ] Islands in order: `kumsal` → `kar` → `volkan` → `orman` → `gok`; each with `testPath`, checkpoints, signs, secret, vista; `node tools/smoke.mjs --level=<id>` at `?quality=low` (GL draws ≤ 250) and high (≤ 900), `node --check`
- [ ] `fener` last (reuses everything) + boss; credits screen
- [ ] Bundle: 1k HDRIs only, trimmed sfx manifest, theme packs on demand, loading card
- [ ] "Yakında" map node for `kanyon`; ship with "Yakında" on any island that slips

### P1 — should
- [ ] Dolap cosmetics (4 scarves + 4 hats on `pSpin`, menu preview)
- [ ] Günün Görevi
- [ ] `L.waterfall` curtain (orman), lighthouse beam spotlight, fireflies streaming to the cove
- [ ] Assist auto-offer after 3 faints; reduce-shake; solak layout
- [ ] Runtime quality probe + `qualityAuto`
- [ ] esbuild bundle + Capacitor shell (`www/`), Preferences mirror of the save

### P2 — nice
- [ ] Kartpostal JPEG gallery (`pitir.postcards.v1`), photo-mode button
- [ ] Boat-ride transition between islands (Pıtır's boat on the Water while the next HDRI fades in)
- [ ] `kanyon` bonus island (red_sand / sandstone_cracks / qwantani_noon already on disk; conveyor sand rivers, mesas by cannon)
- [ ] Red-coin dash challenge type, `L.breakable` crates
- [ ] `rock_face_01/02` island skirts, decimated `island_tree_02` hero tree

### Risks
| Risk | Mitigation |
|---|---|
| Draw calls: today ~1,850 real GL draws on high for `kristal` | E8 (layers, cadence, shadows off low), instanced coins/kit props, the GL-wrapped budget in smoke; `gok` has no water pass |
| Cannon landing precision (fixed 120 Hz integration, `fallCap`) | the solve is exact in the engine's integrator; smoke test teleports to the cannon and ticks a flight, asserting landing within 0.6 m of `to` |
| Audio memory on phones | only CORE decoded eagerly (already so); theme keys `ensure`d on load and released on unload; trimmed manifest |
| Bundle size (141 MB on disk) | §5.3; the 2k HDRIs, unused sfx and 1k JPGs never enter `www/` |
| Lantern_01 transmission on mobile | E7 material swap; already decimated to 3.4k tris |
| Enclosed geometry pulling the camera to 1.5 m | §2.0 rule: no roof < 9 m; all former caves are open trenches/bowls/arches |
| Eruption soft-lock | lava resets on `respawn`/`faint`, re-arms on crater entry; rim checkpoint above the base level |
| Over-scope | `fener` last, "Yakında" nodes, Dolap/daily in P1; one island per agent with the §2 coordinates as the spec |
| Kid difficulty | §2.0 numbers, Yardım Modu must-have, cam.auto, every crystal path tested at low tier with the smoke `testPath` |

---

## 8. Decisions log (judge points → resolution)
1. Cannon: asymmetric solve (tUp on GRAV, tDown on GRAV·FALL_MULT), no `flying` physics flag beyond `fallCap`/`controlLock`; P3's symmetric formula rejected.
2. Updrafts write `vel.y`, never `extVel`. 3. Wind eases `extVel` with `clampLength(0, speed)`, speed ≤ 4.
4. Hidden colliders reuse `noSolid` via `setSolid` and leave `solidMeshes`. 5. Lava sea / cloud fall branch on `sim.waterKind`.
6. Stepped ramps rise 0.35 m. 7. No enclosed spaces (sea cave → arch, lava tube removed, ice cave → open valley, star well → open bowl, temple chamber → courtyard).
8. Rising lava resets on respawn. 9. Lantern_01 glass → MeshStandardMaterial. 10. No 2.2 m bridges, no crosswind over planks, Yardım Modu + cam.auto are P0.
11. Roster fixed: kristal → kumsal → kar → volkan → orman → gok → fener; kanyon bonus. 12. Island 2 introduces two mechanics; nothing crumbles before island 3, and never faster than 1.0 s.
13. Gök's first crystal is on-island; its routes are listed with checked distances; the ski run has rails and ends on solid ground; Fener's beam gates real risers.
14. Draw budget uses the GL-wrapped count. 15. Postcards under a separate key. 16. All crystal and island names are Turkish. 17. `step_sand_4` does not exist (3 sand steps + `step_sand_dry`).
