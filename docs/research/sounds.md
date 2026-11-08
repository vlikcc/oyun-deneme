# Zapsplat sound scout — Pıtır'ın Kristal Adası (level pack)

Scouted 2026-11-08 from https://www.zapsplat.com (in-page search, no login). Nothing downloaded yet.

## How to read this file

- **duration** comes from the player's `data-duration` attribute (integer seconds); `<1 s` means a sub-second one-shot.
- **license** column:
  - **STD (contributor)** = ZapSplat Standard License (free account). Attribution required in the game credits: `Sound effects obtained from https://www.zapsplat.com`. Contributor packs (PMSFX, Blastwave FX, Audio Hero, Felix Blume, Articulated, SoundBits, Music For Video, Kulluh, Dave Miles, …) are distributed by Zapsplat under the same Standard License.
  - **CC0** = public-domain file hosted by Zapsplat (no attribution needed; keep the credit line anyway).
  - **GOLD** = premium file (Gold membership only). Listed only as a fallback, do not download with a free account.
- Music tracks are under the same Standard License as the SFX; the credit line covers them too (double-check https://www.zapsplat.com/license-type/standard-license/ before shipping).
- The preview mp3 URLs are the ones the site's own player streams. Download command (works, verified with a headers-only request): `curl -sL -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36' -H 'Referer: https://www.zapsplat.com/' -o out.mp3 '<url>'`. A few filenames contain spaces; they are written here with `%20` so they can be pasted directly.
- Preview mp3s are the full-length files (the existing 13 sounds in `assets/sfx` were fetched the same way). WAV needs a logged-in download, not needed for a web/Capacitor build.

### Re-running a search

Zapsplat blocks curl for HTML, but inside a browser tab on zapsplat.com:

```js
const params = new URLSearchParams({ s: 'bubble pop', post_type: 'music', sort_by: 'downloads_desc' });
// optional: params.append('sound-effect-category[]', 304);   // 304 = Royalty Free Music, 8967 = Game Music and Loops,
//                                                               // 310 = Cartoon and Funny (music), 105 = Wind, 138 = Snow and Ice,
//                                                               // 186 = Fire, 352 = Forest and Jungle Ambiences, 68 = Cartoon, 835 = Game Developer
const doc = new DOMParser().parseFromString(await (await fetch('/?' + params)).text(), 'text/html');
[...doc.querySelectorAll('article.sound-effect-container:not(.sound-pack-archive-card)')].map(a => ({
  title: a.querySelector('.sound-effect-title a').textContent.trim(),
  sec: a.querySelector('.zs-audio-player').dataset.duration,
  mp3: a.querySelector('.zs-audio-player').dataset.mp3,
  premium: a.querySelector('.sound-effect-licencing-options').dataset.isPremium === '1',
}));
```

Search is an AND match on all words (3-word queries often return nothing); 30 results per page. The `post_type_filter[]=music` checkbox in the advanced form is the music/music-pack post type, but the easiest music filter is the category id 304 (all music lives under `/wp-content/uploads/2015/music-one/` or `/music-game/`).

---

## 1. Footsteps (short single steps, play 2–3 variants round-robin)

| key | title | duration | mp3 URL | license |
|---|---|---|---|---|
| step_grass_1 | Single footstep, shoe, work boot in grass. Version 1 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-41945/zapsplat_foley_footstep_single_boot_grass_001_45960.mp3 | STD (ZapSplat) |
| step_grass_2 | Single footstep, shoe, work boot in grass. Version 2 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-41945/zapsplat_foley_footstep_single_boot_grass_002_45842.mp3 | STD (ZapSplat) |
| step_grass_3 | Single footstep, shoe, work boot in grass. Version 4 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-41945/zapsplat_foley_footstep_single_boot_grass_004_45844.mp3 | STD (ZapSplat) |
| step_grass_4 | Single footstep, shoe, work boot in grass. Version 8 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-41945/zapsplat_foley_footstep_single_boot_grass_008_45848.mp3 | STD (ZapSplat) |
| step_stone_1 | Footsteps, shoes on layer of stones on ground, single fast footstep, version 1 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-115012/zapsplat_foley_footstep_shoe_on_stones_ground_single_fast_001_115213.mp3 | STD (ZapSplat) |
| step_stone_2 | Footsteps, shoes on layer of stones on ground, single fast footstep, version 2 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-115012/zapsplat_foley_footstep_shoe_on_stones_ground_single_fast_002_115214.mp3 | STD (ZapSplat) |
| step_stone_3 | Footsteps, shoes on layer of stones on ground, single fast footstep, version 3 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-115012/zapsplat_foley_footstep_shoe_on_stones_ground_single_fast_003_115215.mp3 | STD (ZapSplat) |
| step_stone_4 | Footsteps, shoes on layer of stones on ground, single fast footstep, version 4 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-115012/zapsplat_foley_footstep_shoe_on_stones_ground_single_fast_004_115216.mp3 | STD (ZapSplat) |
| step_sand_1 | Shoe, single footstep in wet sand. Version 1 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-35448/zapsplat_foley_footstep_single_shoe_wet_sand_001_41431.mp3 | STD (ZapSplat) |
| step_sand_2 | Shoe, single footstep in wet sand. Version 2 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-35448/zapsplat_foley_footstep_single_shoe_wet_sand_002_41432.mp3 | STD (ZapSplat) |
| step_sand_3 | Shoe, single footstep in wet sand. Version 3 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-35448/zapsplat_foley_footstep_single_shoe_wet_sand_003_41433.mp3 | STD (ZapSplat) |
| step_sand_dry | Footstep, single, flip flop on road or track lightly covered with sand. Version 20 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-35448/zapsplat_foley_footstep_single_flip_flop_road_light_sand_covering_020_41300.mp3 | STD (ZapSplat) |
| step_snow_1 | Single footstep in fresh snow, walking 4 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_foley_footstep_single_snow_walking_004_92728.mp3 | STD (ZapSplat) |
| step_snow_2 | Single footstep in fresh snow, walking 5 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_foley_footstep_single_snow_walking_005_92729.mp3 | STD (ZapSplat) |
| step_snow_3 | Single footstep in fresh snow, walking 6 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_foley_footstep_single_snow_walking_006_92730.mp3 | STD (ZapSplat) |
| step_snow_4 | Single footstep in fresh snow, walking 7 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_foley_footstep_single_snow_walking_007_92731.mp3 | STD (ZapSplat) |
| slide_scree | Sneaker, shoe scuff on tiny stones, long slide (player sliding on gravel/slope) | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-115012/zapsplat_foley_footsteps_sneakers_scuff_tiny_stones_slide_long_115732.mp3 | STD (ZapSplat) |

## 2. Slime (squish / blob move)

| key | title | duration | mp3 URL | license |
|---|---|---|---|---|
| slime_squish | Cartoon slime, squelch, bubble, dribble | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-46416/zapsplat_cartoon_slime_squelchy_bubble_dribble_54623.mp3 | STD (ZapSplat) |
| slime_move | Cartoon, large alive slime, gooey mess, movements 1 (loop-able blob hop/crawl) | 5 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-46416/zapsplat_cartoon_slime_large_alive_gooey_mess_movements_001_47576.mp3 | STD (ZapSplat) |
| slime_bubbles | Slime bubbles, goo, could be swamp 1 | 6 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-46416/zapsplat_cartoon_slime_goo_bubbles_swamp_001_51665.mp3 | STD (ZapSplat) |
| slime_gurgle | Cartoon slime, squelch, gurgle, drain (slime death/melt) | 5 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-46416/zapsplat_cartoon_slime_squelch_gurgle_drain_54621.mp3 | STD (ZapSplat) |
| slime_big_growl | Big growling bubbling slime 3 (big/boss slime) | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-61905/zapsplat_cartoon_slime_big_growling_slimy_bubbling_003_62808.mp3 | STD (ZapSplat) |

## 3. Enemy hit / impacts

| key | title | duration | mp3 URL | license |
|---|---|---|---|---|
| enemy_hit | Cartoon impact, high pitched, slightly hollow 2 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-27787/zapsplat_cartoon_impact_hit_high_pitched_hollow_002_28924.mp3 | STD (ZapSplat) |
| enemy_hit_punch_1 | Cartoon punch 1 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-14566/zapsplat_cartoon_punch_001_17899.mp3 | STD (ZapSplat) |
| enemy_hit_punch_2 | Cartoon punch 2 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-14566/zapsplat_cartoon_punch_002_17900.mp3 | STD (ZapSplat) |
| enemy_hit_punch_3 | Cartoon punch 3 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-14566/zapsplat_cartoon_punch_003_17901.mp3 | STD (ZapSplat) |
| enemy_hit_bounce | Cartoon impact, bounce 2 (soft bonk, e.g. head-bump on a block) | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-46416/zapsplat_cartoon_impact_or_bounce_002_51681.mp3 | STD (ZapSplat) |
| enemy_hit_metal | A cartoon metal impact, hit, clang, version 1 (hitting a spiky / armored enemy) | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-107506/zapsplat_cartoon_metal_hit_clang_001_110558.mp3 | STD (ZapSplat) |
| enemy_hit_arrow | Cartoon arrow hit target (thwip, for projectiles) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-14566/zapsplat_cartoon_arrow_hit_target_18120.mp3 | STD (ZapSplat) |
| enemy_hit_metal_gold | Cartoon heavy hard hit, impact, metal 4 (fallback) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-23735/zapsplat_cartoon_impact_hard_metal_004_24738.mp3 | GOLD |

## 4. Spiky / metal rolling

| key | title | duration | mp3 URL | license |
|---|---|---|---|---|
| spiky_roll_loop | Large heavy ball or boulder rolling, rumbling (loop under a rolling boulder / big spiky) | 56 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-61905/zapsplat_foley_large_heavy_ball_or_boulder_rolling_rumbling_67165.mp3 | STD (ZapSplat) |
| spiky_roll_small | Glass marble roll on wooden floor 1 (small spiky patrol, pitch-shift down) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-18146/zapsplat_leisure_marble_glass_roll_wood_floor_001_18360.mp3 | STD (ZapSplat) |
| spiky_roll_ball | Soccer ball rolling on hard ground 1 | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-27787/zapsplat_sport_soccer_ball_roll_hard_ground_001_29034.mp3 | STD (ZapSplat) |
| spiky_roll_metal | Small metal ball roll down the inside on a plastic tube 1 | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-46416/zapsplat_foley_ball_metal_small_roll_down_inside_plastic_tube_001_51457.mp3 | STD (ZapSplat) |
| spiky_roll_wood | Solid round chunk of wood roll on paving stones 5 | 4 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-100509/zapsplat_foley_wood_peice_solid_chunk_roll_pavers_005_100811.mp3 | STD (ZapSplat) |
| spiky_roll_gold | Metal ball rolling on wood (seamless loop, fallback) | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-gma/gma_metal_on_wood_rolling_ball_loop_01_690.mp3 | GOLD (GameMaster Audio) |

No free "spike trap" one-shot exists (only GameMaster Audio premium `gma_rock_impact_spike_trap_01..03`); use `enemy_hit_metal` + existing `hurt.mp3` for spike contact.

## 5. Crumbling rock / platform break

| key | title | duration | mp3 URL | license |
|---|---|---|---|---|
| rock_crumble_1 | Rock, stone or brick structure crumble, collapse, designed 9 (short) | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_foley_rocks_stone_bricks_structure_crumble_designed_009_93042.mp3 | STD (ZapSplat) |
| rock_crumble_2 | Rock, stone or brick structure crumble, collapse, designed 1 | 4 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_foley_rocks_stone_bricks_structure_crumble_designed_001_93034.mp3 | STD (ZapSplat) |
| rock_crumble_3 | Rock, stone or brick structure crumble, collapse, designed 8 | 4 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_foley_rocks_stone_bricks_structure_crumble_designed_008_93041.mp3 | STD (ZapSplat) |
| rock_landslide | Landslide, rocks and stones rumble as they fall, slide and roll, designed (big collapse) | 10 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_nature_landslide_rocks_stones_fall_slide_roll_rumble_designed_93069.mp3 | STD (ZapSplat) |
| platform_crack_warn | Impact, hit loose ground, dirt and soil collapses and falls 14 (crumble-platform "about to fall" tick) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-100509/zapsplat_impacts_hit_loose_ground_dirt_impact_collapse_fall_014_102683.mp3 | STD (ZapSplat) |
| wood_break | Large wood board bend, stress and splinter, breaking 3 (wooden platform/bridge break) | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-27787/zapsplat_foley_wood_board_large_stress_break_splinter_003_30011.mp3 | STD (ZapSplat) |
| wood_snap_1 | Wood, twig snap in forest, stereo, medium loud, single | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-pmsfx/PM_WOODBrk_Twig_Snap_Forest_STEREO_4_PMSFX_TS23_4094.mp3 | STD (PMSFX) |
| wood_snap_2 | Wood, twig snap in forest, stereo, break, splinters | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-pmsfx/PM_WOODBrk_Twig_Snap_Forest_STEREO_17_PMSFX_TS23_4107.mp3 | STD (PMSFX) |
| wood_rotten_break | Impact, hit old rotten tree trunk, wood breaks off and fine debris crumbles 2 | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-100509/zapsplat_impacts_wood_rotten_tree_trunk_hit_break_crumple_002_102685.mp3 | STD (ZapSplat) |

## 6. Ice (crack, break, slide)

| key | title | duration | mp3 URL | license |
|---|---|---|---|---|
| ice_crack_short | Thin ice crack under pressure 1 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-five/zapsplat_nature_thin_ice_crack_under_pressure_001.mp3 | STD (ZapSplat) |
| ice_crack_cc0 | Thin ice under pressure then cracks (squeak then break) | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/cc0/nature_ice_thin_pressure_squeaks_then_break.mp3 | CC0 |
| ice_crack_low | Thin ice crack, lower pitched | 5 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-61905/zapsplat_foley_ice_thin_crack_lower_pitched_67572.mp3 | STD (ZapSplat) |
| ice_crack_long | Ice crack 2 | 7 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-five/zapsplat_nature_ice_crack_002.mp3 | STD (ZapSplat) |
| ice_break_1 | Small impact, breaking ice chunk 1 (ice block shatter) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-one/ice_chunk_small_impact_surface_break_001.mp3 | STD (ZapSplat) |
| ice_break_2 | Small impact, breaking ice chunk 2 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-one/ice_chunk_small_impact_surface_break_002.mp3 | STD (ZapSplat) |
| ice_melt | Melting ice flowing, cracking and dripping, designed 3 (melting platform) | 13 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_nature_ice_melting_flowing_cracking_dripping_designed_003_92560.mp3 | STD (ZapSplat) |
| ice_slide | Large chunk of ice slide, movement in smooth ice | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-12634/zapsplat_nature_ice_large_peice_chunch_slide_movement_on_ice_13498.mp3 | STD (ZapSplat) |
| ice_slide_bash | Chunk of ice slide and bash into others, designed | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_nature_ice_chunk_slide_bash_into_others_designed_92555.mp3 | STD (ZapSplat) |
| ice_skate_glide | Ice skating, skates, glides and slides (player sliding on ice, loop) | 12 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-articulated/articulated_ICE%20Skate%20glide%2014.mp3 | STD (Articulated) |
| ice_skate_loop | Ice skater, constant sound of skates, designed | 6 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-46416/zapsplat_sport_ice_skates_skating_constand_designed_001_54791.mp3 | STD (ZapSplat) |
| ice_skate_scrape | Ice skating, skate, scrape or scratch, one leg, single rotate or twist (stop/turn) | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-articulated/articulated_ICE%20Skate%20scrape%20one%20leg%20rotate%2009.mp3 | STD (Articulated) |
| ice_crack_gold | Thin ice crack, melt 1 (fallback, very clean) | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-gma/gma_ice_cracking_melting_01_595.mp3 | GOLD (GameMaster Audio) |

## 7. Lava (bubbling loop)

| key | title | duration | mp3 URL | license |
|---|---|---|---|---|
| lava_flow_loop | Lava flow (the only free "lava" bed; trim to a loop) | 41 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-14566/zapsplat_nature_lava_flow_17940.mp3 | STD (ZapSplat) |
| lava_bubbles_loop | Thick wet watery mud, gunge or gunk bubbles, bubbling, long and slow with spitting (layer over lava_flow) | 17 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-46416/zapsplat_foley_mud_wet_watery_or_gunge_gunk_bubbles_bubbling_long_slow_spitting_47619.mp3 | STD (ZapSplat) |
| lava_bubbles_small | Wet mud, short small air bubbles, constant | 6 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-46416/zapsplat_foley_wet_mud_short_small_air_bubbles_constant_47640.mp3 | STD (ZapSplat) |
| lava_bubble_pop | Wet sloppy mud, short bubble, bubbling 1 (single lava bubble burst) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-46416/zapsplat_foley_wet_mud_bubble_short_001_47630.mp3 | STD (ZapSplat) |
| lava_rumble_loop | LFE tremor, rumble, could be earthquake, thunder or underground volcano etc, sound design 1 | 35 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-18146/zapsplat_sound_design_lfe_tremor_rumble_001_20257.mp3 | STD (ZapSplat) |
| lava_loop_gold | Volcano ambience, bubbling lava and magma, continuous loop (fallback) | 60 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-smartsound/smartsound_ATMO_VOLCANO_Volcano_Loop.mp3 | GOLD (SmartSound) |

## 8. Wind loops (sky islands) and snow wind

| key | title | duration | mp3 URL | license |
|---|---|---|---|---|
| wind_sky_loop | Constant strong wind in palm trees, some gusts 1 (steady bed for sky islands) | 82 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-61905/zapsplat_nature_wind_palm_trees_constant_some_gusts_001_64793.mp3 | STD (ZapSplat) |
| wind_breeze | Wind, breeze on palm trees, water in canal close by (gentle) | 50 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-five/zapsplat_nature_wind_breeze_palm_trees_water_canal.mp3 | STD (ZapSplat) |
| wind_strong | Very strong wind, coastal storm (designed, clean) | 83 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_nature_wind_very_strong_coastal_storm_designed_85309.mp3 | STD (ZapSplat) |
| wind_alpine | Weather, mountain storm ambience, alpine, wind, medium strong gusts, occasional drips, forest, very remote | 237 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-pmsfx/PM_WINDGust_Wind_Alpine_With_Medium_Strong_45kmph_Gusts_Ocassional_Drips_Vegetation_Forest_Remote_1_PMSFX_MSWNR4194.mp3 | STD (PMSFX) |
| wind_airy | Eerie science fiction atmosphere, airy hissing wind, cold and desolate (high-altitude hiss, use quietly) | 85 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-115012/zapsplat_science_fiction_atmpsphere_eerie_airy_hissing_wind_cold_desolate_115084.mp3 | STD (ZapSplat) |
| wind_howl_loop | Designed eerie wind howl, science fiction planet atmosphere, complex, loop (too eerie for kids? audition) | 174 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-skyclad-sound/skyclad_sound_DSGNErie_Atmosphere%20Wind%20Howl%20Complex%20Diffuse%20Low%20Dark%20Ghostly%20Murky%20Elements%20Come%20and%20Go,%20Buzz%20Light%20Steadier%20Swell%20Dip,%20Barron%20Desolate,%20Loop_SCS_NONE_938.mp3 | STD (Skyclad Sound) |
| snow_wind_loop_1 | Cold blizzard snow storm, strong wind 1 | 62 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_nature_wind_cold_blizzard_snow_storm_001_85967.mp3 | STD (ZapSplat) |
| snow_wind_loop_2 | Cold blizzard snow storm, strong wind 4 | 62 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_nature_wind_cold_blizzard_snow_storm_004_85970.mp3 | STD (ZapSplat) |
| snow_wind_icy | Cold blizzard wind, powdered snow blown around in a howling icy wind, designed | 66 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_nature_cold_wind_blizzard_powered_snow_blown_around_howling_wind_icy_designed_91856.mp3 | STD (ZapSplat) |
| snow_wind_strong | Strong cold blizzard, snowstorm style wind | 107 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_nature_wind_strong_cold_blizzard_snow_storm_designed_85304.mp3 | STD (ZapSplat) |
| snow_wind_cc0 | Strong, constant blizzard style wind | 110 s | https://www.zapsplat.com/wp-content/uploads/2015/cc0/weather_wind_blizzard_like_strong_constant.mp3 | CC0 |
| snow_blizzard_amb | Blizzard, snow ambience | 82 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-blastwave-fx/Blastwave_FX_BlizzardSnow_BW.59805.mp3 | STD (Blastwave FX) |

## 9. Jungle, cave and temple ambiences

| key | title | duration | mp3 URL | license |
|---|---|---|---|---|
| amb_jungle_day | Jungle daytime ambience, insects birds and animals | 96 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-blastwave-fx/Blastwave_FX_JungleDay_SFXB.106.mp3 | STD (Blastwave FX) |
| amb_jungle_asia | Jungle, environment, ambience, insects and birds, Asia | 92 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-audio-hero/audio_hero_JungleAsia_DIGIC03-65.mp3 | STD (Audio Hero) |
| amb_jungle_amazon | Amazon rainforest ambience, cicada and insect noise with river in background 1 | 70 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-felix-blume/felix_blume_nature_amazon_rainforest_ambience_cicada_insects_river_in_background_001.mp3 | STD (Felix Blume) |
| amb_jungle_night | Thailand, jungle night ambience, pond, insects, frogs mating 2 | 84 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-free-to-use-sounds/ftus_thailand_jungle_night_pond_frogs_mating_002.mp3 | STD (FreeToUseSounds) |
| amb_jungle_rain | Tropical Ambience, Rainforest rain moderately, sparse bird chirps (made as a loop, "LOOPLR") | 195 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-articulated/articulated_TROPICAL%20Rainforest%20rain%20moderately%20with%20sparse%20bird%20chirps_LOOPLR.mp3 | STD (Articulated) |
| amb_rainforest_night | Rainforest ambience, summer, night time, quiet insects, distant waterfall, Eastern Australia | 83 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-77317/zapsplat_nature_rainforest_insects_quiet_distant_waterfall_summer_night_time_eastern_australia_78197.mp3 | STD (ZapSplat) |
| amb_cave_drips | Cave ambience, water dripping and running into deeper water, stream, echoey | 71 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-55112/zapsplat_nature_cave_cavern_ambience_water_dripping_running_deep_echo_55313.mp3 | STD (ZapSplat) |
| amb_cave_wind | Cave ambience, water drips and splatters, subtle wind howling | 89 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-55112/zapsplat_nature_cave_ambience_water_drips_splatters_subtle_wind_howling_distant_60081.mp3 | STD (ZapSplat) |
| amb_cave_stream | Cave ambience, fast flowing water, running and dripping, distant | 79 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-55112/zapsplat_nature_cave_ambience_fast_flowing_water_running_dripping_distant_55301.mp3 | STD (ZapSplat) |
| amb_cave_howl | Cave ambience, water, stream flowing, wind howl and rumble outside | 90 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-55112/zapsplat_nature_cave_ambience_water_stream_flowing_reverberant_wind_howl_and_rumble_outside_60082.mp3 | STD (ZapSplat) |
| amb_temple_drone | Dungeon ambience, cold dark and eerie droning tone, could also be cave (temple bed; keep quiet, it is "horror" tagged) | 216 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-41945/zapsplat_horror_dungeon_amb_cold_eerie_dark_44127.mp3 | STD (ZapSplat) |
| amb_temple_drone_wind | Dungeon ambience, cold dark and eerie droning tone with howling wind outside and water drips | 216 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-41945/zapsplat_horror_dungeon_amb_howling_wind_outside_water_drips_44129.mp3 | STD (ZapSplat) |
| amb_temple_airy | Eerie science fiction atmosphere, dark airy droning (alternative temple bed) | 82 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-115012/zapsplat_science_fiction_atmosphere_eerie_dark_airy_droning_115087.mp3 | STD (ZapSplat) |
| temple_mystery_sting | Game sound, mystery musical stab, warm mallets (one-shot accent when entering the temple / solving a puzzle) | 7 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-112294/zapsplat_multimedia_game_sound_mystery_musical_stab_mallets_warm_114232.mp3 | STD (ZapSplat) |
| temple_twinkle | Designed magical twinkle, mysterious (accent) | 10 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-35448/zapsplat_fantasy_magic_twinkle_slightly_mysterious_39936.mp3 | STD (ZapSplat) |

No dedicated "temple" ambience exists on Zapsplat; the recommendation is `amb_cave_drips` (quiet) + `amb_temple_airy` or the `music_mystery_bed` track below, plus the two one-shot accents.

## 10. Fire

| key | title | duration | mp3 URL | license |
|---|---|---|---|---|
| fire_crackle_loop | Fire, bonfire, pine branch crackles and sizzles on fire | 45 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-three/fire_bonfire_sizzle_crackle_pine_branch_burning_wood.mp3 | STD (ZapSplat) |
| fire_pit_loop_1 | Fire in fire pit, flames crackle as wood and wet leaves burn 2 | 22 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_nature_fire_pit_flames_crackle_burn_wet_leaves_short_002_89497.mp3 | STD (ZapSplat) |
| fire_pit_loop_2 | Fire in fire pit, flames crackle as wood and wet leaves burn 3 | 22 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_nature_fire_pit_flames_crackle_burn_wet_leaves_short_003_89498.mp3 | STD (ZapSplat) |
| fire_crackle_gold | Ambience of burning and crackling camp or hearth fire (fallback) | 17 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-smartsound/smartsound_ATMO_FIRE_Camp_Fire_Crackle_02.mp3 | GOLD (SmartSound) |

## 11. Cannon / launcher whoosh, spring, switch, lever

| key | title | duration | mp3 URL | license |
|---|---|---|---|---|
| cannon_launch | Game sound, simple retro arcade rocket fizzle and launch | 4 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-112294/zapsplat_multimedia_game_sound_simple_retro_arcade_rocket_fizzle_launch_114677.mp3 | STD (ZapSplat) |
| cannon_fire | Firework, small rocket launch 1 (pop + whoosh) | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-one/firework_rocket_small_launch_001.mp3 | STD (ZapSplat) |
| cannon_rocket | Small missile or rocket launch with a fizz and whoosh 6 | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-61905/zapsplat_warfare_missile_rocket_small_launch_fizz_whoosh_006_62726.mp3 | STD (ZapSplat) |
| cannon_slingshot | Slingshot shoot 1 (short twang-launch) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-14566/zapsplat_warfare_slingshot_fire_001_15871.mp3 | STD (ZapSplat) |
| cannon_blast_scifi | Science fiction weapon, large cannon or RPG launcher, shoot, blast (heavier option) | 5 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_science_fiction_weapon_large_cannon_rpg_launcher_fire_blast_89857.mp3 | STD (ZapSplat) |
| whoosh_dash_1 | Cartoon swipe, fast whoosh, good as a grab or dash sound 6 (launch / fly-by whoosh) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-69838/zapsplat_cartoon_whoosh_swipe_fast_grab_dash_006_74747.mp3 | STD (ZapSplat) |
| whoosh_dash_2 | Cartoon swipe, fast whoosh, good as a grab or dash sound 15 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-69838/zapsplat_cartoon_whoosh_swipe_fast_grab_dash_015_74756.mp3 | STD (ZapSplat) |
| whoosh_rise | Vintage cartoon, zoom, rise, whoosh (rising launch) | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-pmsfx/PM_squeaky_metalDesigned_Vintage_SFX_4_461.mp3 | STD (PMSFX) |
| spring_boing | Cartoon plucked twang, boing, spring, jump 2 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-61905/zapsplat_cartoon_twang_boing_spring_jump_plucked_002_65282.mp3 | STD (ZapSplat) |
| spring_bounces | Cartoon spring, boing or jump, many fast bounces or hops (big launcher spring) | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-55112/zapsplat_cartoon_spring_boing_jump_jaw_bounces_hops_many_fast_60820.mp3 | STD (ZapSplat) |
| spring_twang_hi | Cartoon ruler twang, short, higher pitched | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-master-of-dreams/master_of_dreams_cartoon_twang_24_222.mp3 | STD (Master of Dreams) |
| switch_click | Plastic wall light switch click, flick 1 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_household_light_switch_wall_plastic_click_flick_001_86841.mp3 | STD (ZapSplat) |
| switch_click_bright | Electrical mains switch single click, bright | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-107506/zapsplat_household_switch_electrical_mains_click_single_bright_110045.mp3 | STD (ZapSplat) |
| switch_toggle | Radio switch, toggle, click 2 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-61905/zapsplat_technology_radio_switch_toggle_click_002_69258.mp3 | STD (ZapSplat) |
| lever_click_1 | Sci-fi, steampunk mechanism, one shot, click, button or lever 1 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-pmsfx/PM_MMM_FREE_ONESHOTS_MECHANICAL_1.mp3 | STD (PMSFX) |
| lever_click_2 | Sci-fi, steampunk mechanism, one shot, click, button or lever 2 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-pmsfx/PM_MMM_FREE_ONESHOTS_MECHANICAL_2.mp3 | STD (PMSFX) |
| lever_gate | Metal farm gate lever lock movement 1 (big floor lever) | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-two/industrial_metal_gate_lever_movement_001.mp3 | STD (ZapSplat) |
| lever_pull_long | Antique slot machine mechanical lever pull | 7 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-blastwave-fx/Blastwave_FX_SlotMachinePull_S08SP.667.mp3 | STD (Blastwave FX) |

## 12. Key pickup, door unlock, heart/life, star/medal, 1-up

| key | title | duration | mp3 URL | license |
|---|---|---|---|---|
| key_pickup | Game tone, high pitched glassy bell chime, good for collect item or gain point 1 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-46416/zapsplat_multimedia_game_sound_glassy_bell_chime_high_pitched_collect_item_gain_point_001_50747.mp3 | STD (ZapSplat) |
| key_pickup_twinkle | Warm, magical soft digital twinkle tone, game, positive, award or achievement unlock 6 | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-35448/zapsplat_multimedia_game_sound_soft_warm_digital_twinkle_magical_award_achievement_unlock_006_40703.mp3 | STD (ZapSplat) |
| key_jingle_foley | Bunch of small keys pick up from wooden table 4 (layer under key_pickup) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-69838/zapsplat_household_keys_bunch_small_pick_up_from_wooden_table_004_76311.mp3 | STD (ZapSplat) |
| door_unlock | Game sound, magical door unlock, open 1 | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-69838/zapsplat_multimedia_game_sound_magical_door_unlock_open_001_75178.mp3 | STD (ZapSplat) |
| door_lock_click | Object, Item, Interaction, Menu, UI, Action, Open, Close, Door, Lock (short mechanical) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-pmsfx/PM_FN_Objects_Items_Interactions_Menus_90.mp3 | STD (PMSFX) |
| heart_pickup_1 | Game, one up, extra life, positive tone 3 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-four/zapsplat_multimedia_game_one_up_extra_life_003.mp3 | STD (ZapSplat) |
| heart_pickup_2 | Game, one up, extra life, positive tone 4 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-four/zapsplat_multimedia_game_one_up_extra_life_004.mp3 | STD (ZapSplat) |
| heart_pickup_warm | Game sound, happy bright and warm, positive tone, award, bonus etc 7 | 4 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-46416/zapsplat_multimedia_game_sound_happy_bright_warm_positive_tone_007_53448.mp3 | STD (ZapSplat) |
| heart_pickup_mobile | Mobile game tone, warm, positive, bonus, award or level up sound 2 | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-55112/zapsplat_multimedia_game_sound_mobile_game_warm_positive_bonus_award_level_up_tone_002_61034.mp3 | STD (ZapSplat) |
| gain_life | Game tone, positive action, level up, gain life etc 2 | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-23735/zapsplat_multimedia_game_sound_positive_action_tone_002_25061.mp3 | STD (ZapSplat) |
| power_up | Retro game tone, digital synth, fifths, ascend, power up, gain a life, level up 4 | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-35448/zapsplat_multimedia_game_sound_retro_digital_fifths_ascend_power_up_level_up_004_40596.mp3 | STD (ZapSplat) |
| one_up | Classic game sound, one up, rising, positive. Version 5 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-35448/zapsplat_multimedia_game_sound_classic_1_up_005_41732.mp3 | STD (ZapSplat) |
| one_up_tone | Game, one up, extra life, positive tone 5 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-four/zapsplat_multimedia_game_one_up_extra_life_005.mp3 | STD (ZapSplat) |
| star_jingle_1 | Game sound, bright sparkle tone, positive 7 | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-35448/zapsplat_multimedia_game_sound_bright_positive_sparkle_007_40524.mp3 | STD (ZapSplat) |
| star_jingle_2 | Game sound, bright sparkle tone, positive 18 | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-35448/zapsplat_multimedia_game_sound_bright_positive_sparkle_018_40535.mp3 | STD (ZapSplat) |
| star_wand_ping | Fairy magic wand ping 2 | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-77317/zapsplat_fantasy_magic_wand_ping_single_fairy_002_80469.mp3 | STD (ZapSplat) |
| medal_glissando | Magical ascending glissando, warm harp and mallet, bright, ascending 4 (medal / rank reveal) | 7 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-61905/zapsplat_fantasy_magic_glissando_warm_harp_mallet_bright_ascending_004_65476.mp3 | STD (ZapSplat) |
| medal_fairy_dust | Magical fairy dust sprinkle, twinkling, glistening, glittery bell tree style tone 4 | 7 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-61905/zapsplat_fantasy_magical_fairy_dust_twinkling_glistening_glittery_bell_tree_sprinkling_004_64123.mp3 | STD (ZapSplat) |
| medal_tropical | Game sound, tropical game, positive tone, award or bonus 2 (fits the island theme) | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-55112/zapsplat_multimedia_game_sound_tropical_game_positive_tone_award_bonus_002_55158.mp3 | STD (ZapSplat) |
| bonus_warm_10 | Game sound, happy bright and warm, positive tone, award, bonus etc 10 | 5 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-46416/zapsplat_multimedia_game_sound_happy_bright_warm_positive_tone_010_53451.mp3 | STD (ZapSplat) |
| star_pickup_gold | Game sound, collect item, star pick up 1 (fallback) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-107506/zapsplat_multimedia_game_sound_collect_item_star_pick_up_001_108903.mp3 | GOLD |

## 13. Level complete fanfares (short, cheerful)

| key | title | duration | mp3 URL | license |
|---|---|---|---|---|
| level_complete_kids | Kids game sound, fun and cheeky layered mallets, completed fanfare | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-61905/zapsplat_multimedia_game_sound_kids_fun_cheeky_layered_mallets_completed_fanfare_66203.mp3 | STD (ZapSplat) |
| level_complete_trumpets | Game sound, trumpets fanfare leads into a harp glissando | 6 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-107506/zapsplat_multimedia_game_sound_fanfare_trumpets_and_harp_glissando_109636.mp3 | STD (ZapSplat) |
| level_complete_regal | Game sound, regal trumpets fanfare | 6 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-107506/zapsplat_multimedia_game_sound_fanfare_trumpets_regal_monarch_109638.mp3 | STD (ZapSplat) |
| level_complete_synth | Game sound, success, win fanfare, synth brass | 4 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-93160/zapsplat_multimedia_game_sound_fanfare_synth_brass_93243.mp3 | STD (ZapSplat) |
| level_complete_dreamy | Game sound, win, complete, success or level up glissando, soft and dreamy | 8 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-93160/zapsplat_multimedia_game_sound_glissando_win_complete_success_soft_dreamy_96111.mp3 | STD (ZapSplat) |
| level_complete_retro | Retro game tone, musical level complete 4 | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-21014/zapsplat_multimedia_game_retro_musical_level_complete_004_21497.mp3 | STD (ZapSplat) |
| level_complete_synth_1 | Game sound, tone, level complete or prompt, musical synth 1 | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-35448/zapsplat_multimedia_game_tome_musical_synth_level_complete_etc_001_38427.mp3 | STD (ZapSplat) |
| level_complete_organ | Game tone, success fanfare, digital organ 1 | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-46416/zapsplat_multimedia_game_sound_fanfare_success_digital_organ_001_49785.mp3 | STD (ZapSplat) |
| level_end_keys | Game sound, end or complete, synth keys | 4 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-93160/zapsplat_multimedia_game_sound_end_complete_synth_keys_99746.mp3 | STD (ZapSplat) |

## 14. Menu / UI, pause, countdown

| key | title | duration | mp3 URL | license |
|---|---|---|---|---|
| ui_click | UI button click, fast, wooden, organic 3 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-77317/zapsplat_multimedia_button_click_fast_wooden_organic_003_78837.mp3 | STD (ZapSplat) |
| ui_click_digital | Game tone, collect item, digital click 1 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-46416/zapsplat_multimedia_game_sound_collect_item_digital_click_001_49781.mp3 | STD (ZapSplat) |
| ui_hover_1 | Menu, select tone, good for game, app, software interface etc 33 (hover / focus tick) | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-23735/zapsplat_multimedia_game_menu_tone_033_25448.mp3 | STD (ZapSplat) |
| ui_hover_2 | Menu, select tone, good for game, app, software interface etc 37 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-23735/zapsplat_multimedia_game_menu_tone_037_25452.mp3 | STD (ZapSplat) |
| ui_select_1 | Menu, select tone, good for game, app, software interface etc 39 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-23735/zapsplat_multimedia_game_menu_tone_039_25454.mp3 | STD (ZapSplat) |
| ui_select_2 | Menu, select tone, good for game, app, software interface etc 50 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-23735/zapsplat_multimedia_game_menu_tone_050_25465.mp3 | STD (ZapSplat) |
| ui_select_scifi | Game tone, sci-fi, button, select or menu sound 4 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-35448/zapsplat_multimedia_game_sound_tone_button_select_menu_sci_fi_004_40732.mp3 | STD (ZapSplat) |
| ui_blip_8bit | Retro 8-bit arcade style game sound, action blip, collect item 2 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-46416/zapsplat_multimedia_game_sound_arcade_retro_8_bit_action_blip_collect_item_002_54201.mp3 | STD (ZapSplat) |
| ui_back | Multimedia, menu or window close tone (back / close / unpause) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-soundbits/soundbits_CSFX-2_Menu-Close_17.mp3 | STD (SoundBits) |
| ui_open | Object, Item, Interaction, Menu, UI, Action, Open, Close, Door, Lock (menu open) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-pmsfx/PM_FN_Objects_Items_Interactions_Menus_90.mp3 | STD (PMSFX) |
| ui_negative_blip | Game sound, 8-bit blip, collect item, negative (locked level / invalid) | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-110559/zapsplat_multimedia_game_sound_8_bit_blip_collect_item_negative_112011.mp3 | STD (ZapSplat) |
| ui_negative_sparkle | Game sound, bright sparkle or twinkle tone, negative 2 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-35448/zapsplat_multimedia_game_sound_bright_sparkle_twinkle_tone_negative_002_40541.mp3 | STD (ZapSplat) |
| pause_in | Cartoon swanee slide whistle, down fast 7 (playful "pause" blip) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-107506/zapsplat_cartoon_whistle_swanee_slide_down_fast_007_108332.mp3 | STD (ZapSplat) |
| pause_out | Cartoon, slide whistle, pitch slides up with chorus 3 (resume) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-35448/zapsplat_cartoon_slide_whistle_up_chorus_003_35550.mp3 | STD (ZapSplat) |
| pause_music_loop | Game tone, music bed, loop, good for pause or waiting screen, soft, children's, warm chimes | 27 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-46416/zapsplat_multimedia_game_sound_music_bed_loop_pause_waiting_childrens_soft_warm_chiming_49791.mp3 | STD (ZapSplat) |
| pause_music_calm | Game sound, pause music, soft, chiming, calm | 95 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-69838/zapsplat_multimedia_game_sound_pause_music_loop_soft_chime_calm_70247.mp3 | STD (ZapSplat) |
| pause_8bit_gold | 8 bit video game classic pause select (fallback) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-jessey-drake/jessey_drake_oldschool_PAUSE_SELECT_2_video_retro_game_chip_set_8BIT_JD.mp3 | GOLD (Jessey Drake) |
| countdown_beeps | Game sound, car racing game, race start beeps 4 (3-2-1-go) | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-61905/zapsplat_multimedia_game_sound_car_game_starting_beeps_004_63401.mp3 | STD (ZapSplat) |
| countdown_retro | Retro game tone, car racing game start beeps 3 | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-31172/zapsplat_multimedia_game_sound_retro_car_racing_start_beeps_003_34951.mp3 | STD (ZapSplat) |
| countdown_organ | Arcade racing game tone, organ, race start 4 | 4 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_multimedia_game_sound_arcade_racing_game_race_start_tone_organ_004_91584.mp3 | STD (ZapSplat) |
| countdown_blips | Game sound, car racing game, starter blips, beeps, version 2 | 5 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-107506/zapsplat_multimedia_game_sound_car_racing_game_start_blips_beeps_002_109633.mp3 | STD (ZapSplat) |
| timer_tick | Game sound, timer clicks, fast 1 (single tick, loop it per second) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-69838/zapsplat_multimedia_game_sound_clicks_fast_timer_001_70222.mp3 | STD (ZapSplat) |
| timer_ticks_fast | Game sound, mechanical timer fast clicks, countdown | 4 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-69838/zapsplat_multimedia_game_sound_timer_clicks_mechanical_fast_72383.mp3 | STD (ZapSplat) |
| timer_quiz_20s | Musical game quiz timer, countdown, tense but bright 3 (time-attack last 20 s) | 24 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-84577/zapsplat_multimedia_game_quiz_musical_counting_timer_tense_bright_20s_003_91990.mp3 | STD (ZapSplat) |
| countdown_console | Science fiction computer console, alarm beep, warning, countdown 2 | 5 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-55112/zapsplat_science_fiction_computer_console_alarm_beep_warning_countdown_002_59272.mp3 | STD (ZapSplat) |

## 15. Boss roar (cartoon) and bubble pop

| key | title | duration | mp3 URL | license |
|---|---|---|---|---|
| boss_roar_1 | Cartoon, funny monster growl 2 | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-69838/zapsplat_cartoon_monster_growl_funny_002_75407.mp3 | STD (ZapSplat) |
| boss_roar_2 | Cartoon, funny monster growl 6 | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-69838/zapsplat_cartoon_monster_growl_funny_006_75411.mp3 | STD (ZapSplat) |
| boss_laugh_1 | Cartoon monster, gremlin, troll or creature, crazy laugh 1 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-55112/zapsplat_cartoon_monster_gremlin_troll_crazy_laugh_001_55183.mp3 | STD (ZapSplat) |
| boss_laugh_2 | Cartoon monster, gremlin, troll or creature, crazy laugh 2 | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-55112/zapsplat_cartoon_monster_gremlin_troll_crazy_laugh_002_55184.mp3 | STD (ZapSplat) |
| boss_grunt | Cartoon monster, gremlin, troll or creature, grunting vocalisation 3 (boss hit) | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-55112/zapsplat_cartoon_monster_gremlin_troll_crazy_grunting_vocalisation_003_55182.mp3 | STD (ZapSplat) |
| boss_roar_dino | Dinosaur call with forest reverb (bigger roar, still friendly) | 6 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-107506/zapsplat_animals_dinosaur_call_large_land_forest_reverb_109814.mp3 | STD (ZapSplat) |
| boss_growl_dino | Dinosaur growl, vocalisation 7 | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-10157/zapsplat_animal_dinosuar_vocalisation_growl_007_10844.mp3 | STD (ZapSplat) |
| boss_growl_dog | Cartoon dog growl 3 | 4 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-69838/zapsplat_cartoon_male_dog_growl_003_72000.mp3 | STD (ZapSplat) |
| boss_angry_squeak | Male cartoon character, high pitched voice, angry growl or grunt 3 (small angry boss) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-69838/zapsplat_cartoon_character_male_high_pitched_voice_growl_grunt_angry_003_74177.mp3 | STD (ZapSplat) |
| boss_ogre_growl | Monster, ogre, single growl 1 (scarier; audition for the age group) | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-93160/zapsplat_horror_monster_ogre_single_growl_001_97930.mp3 | STD (ZapSplat) |
| boss_footstep | Massive footstep, distant, dinosaur, monster or giant 3 (boss stomp) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-12634/zapsplat_horror_footstep_massive_distant_heavy_dinasour_monster_giant_003_13402.mp3 | STD (ZapSplat) |
| bubble_pop | Cartoon bubble pop | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-77317/zapsplat_cartoon_pop_bubble_etc_001_80358.mp3 | STD (ZapSplat) |
| bubble_pop_designed | Game sound, designed bubble pop 16 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-25674/zapsplat_multimedia_game_designed_bubble_pop_016_26282.mp3 | STD (ZapSplat) |
| bubble_pop_wet | Cartoon wet pop, could be bubble pop or liquid 1 | <1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-77317/zapsplat_cartoon_pop_wet_could_be_bubble_or_liquid_001_80362.mp3 | STD (ZapSplat) |
| bubbles_pop_asc | Cartoon bubbles popping, ascending fast 4 (multi-pop, combo) | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-77317/zapsplat_cartoon_bubbles_popping_ascending_fast_004_80355.mp3 | STD (ZapSplat) |

## 16. Extra cartoon accents that fit Pıtır (optional)

| key | title | duration | mp3 URL | license |
|---|---|---|---|---|
| uke_ascend | Cartoon ascend, climbing up steps, ukulele plucks (level-select cursor up / stairs) | 3 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-14566/zapsplat_cartoon_ascend_steps_strings_17950.mp3 | STD (ZapSplat) |
| uke_descend | Cartoon descend, climbing down steps, ukulele plucks | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-14566/zapsplat_cartoon_descend_steps_strings_17951.mp3 | STD (ZapSplat) |
| uke_impact | Cartoon impact, ukulele strings, slight ascend 2 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-14566/zapsplat_cartoon_impact_strings_slight_ascend_002_17953.mp3 | STD (ZapSplat) |
| vibes_descend | Cartoon descend, vibraphone, happy, fun, mysterious, musical 2 (lose/fail but cute) | 2 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-61905/zapsplat_cartoon_descend_vibraphone_happy_fun_mysterious_musical_002_64771.mp3 | STD (ZapSplat) |
| cartoon_rise_short | Cartoon accent, short rise, slide 2 | 1 s | https://www.zapsplat.com/wp-content/uploads/2015/sound-effects-46416/zapsplat_cartoon_ascend_rise_short_slide_002_50522.mp3 | STD (ZapSplat) |

---

## 17. Music (loopable background tracks)

Zapsplat does have a royalty-free music library (category 304 "Royalty Free Music", sub-category 8967 "Game Music and Loops"). Everything below is free-tier. Only the "Happy"/"Epic" Music For Video pieces are true seamless loops; the longer tracks need a loop point or a crossfade (`AudioBufferSourceNode.loop` with `loopStart/loopEnd`). Nothing matched "ice cold" or "spooky cartoon" literally; the closest fits are marked.

| key | title | duration | mp3 URL | license |
|---|---|---|---|---|
| music_island_loop | Happy – seamless music loop, acoustic, summer, tropical feel, positive, confident, fun, ukulele, bass and drums (Happy 004) — first island | 22 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_orlamusic_Happy%20004.mp3 | STD (Music For Video) |
| music_uke_loop_lazy | Happy – seamless music loop, acoustic, lazy summer feel, positive, fun, ukulele, bass, drums and percussion (Happy 008) | 16 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_orlamusic_Happy%20008.mp3 | STD (Music For Video) |
| music_uke_loop_cheeky | Happy – seamless music loop, acoustic, cheeky, positive, fun and plodding, acoustic guitars, ukulele, bass and drums (Happy 003) | 19 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_orlamusic_Happy%20003.mp3 | STD (Music For Video) |
| music_uke_loop_mid | Happy – seamless music loop, acoustic, positive, confident, fun, medium paced, acoustic guitars, ukulele, bass and drums (Happy 006) | 18 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_orlamusic_Happy%20006.mp3 | STD (Music For Video) |
| music_uke_loop_fills | Happy – seamless music loop, acoustic, positive, confident, fun, acoustic guitars, ukulele bass, drums and electric drum fills (Happy 005) | 18 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_orlamusic_Happy%20005.mp3 | STD (Music For Video) |
| music_menu_cheeky_monkey | "Cheeky Monkey" – playful, cheeky and simple music loop, great for game or app (title / level select) | 29 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/cheeky_monkey_fun_app_playful_cheeky.mp3 | STD (ZapSplat) |
| music_kids_round | Round and Round We Go – fun children's music with a playful, fun feel, piano rhythm, drums, bass and glockenspiel melody | 82 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_zapsplat_round_and_round_we_go_104.mp3 | STD (ZapSplat) |
| music_kids_butterfly | Butterfly – fun children's music with a playful and inquisitive feel with piano, marimba and acoustic bass | 33 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_zapsplat_butterfly_101.mp3 | STD (ZapSplat) |
| music_kids_mr_jelly | Mr Jelly – fun, energetic and cheeky children's music with steel guitar chords and oboe and bassoon melody | 29 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_zapsplat_mr_jelly.mp3 | STD (ZapSplat) |
| music_kids_daft_cat | Daft Cat – cheeky, fun short music ideal for cute kittens or kids at play | 44 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_zapsplat_daft_cat_117.mp3 | STD (ZapSplat) |
| music_kids_playing | Playing – children's music track, simple and playful piano with synth bass and beats | 26 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_darrenifyouask_Playing_BPM_174_016.mp3 | STD (darrenifyouask) |
| music_tropical_steel | Game music – tropical game, fun, light hearted, steel drums, Caribbean, percussive (beach / tropical island) | 72 s | https://www.zapsplat.com/wp-content/uploads/2015/music-game/music_zapsplat_game_music_fun_tropical_caribean_steel_drums_percussion_008.mp3 | STD (ZapSplat) |
| music_tropical_banana | Banana Tree – fun, light-hearted acoustic guitar melody with light percussion and piano rhythm with a tropical feel | 127 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_zapsplat_banana_tree.mp3 | STD (ZapSplat) |
| music_tropical_showtell | Show And Tell – playful and fun children's music with a tropical feel | 152 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/audio_hero_Show-And-Tell_SIPML_Q-0149.mp3 | STD (Audio Hero) |
| music_tropical_dawn | Tropical Dawn – a fresh ambient and chilled track with synthesised warm chords and synth melody, percussion and drums (sky islands / calm) | 120 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_zapsplat_tropical_dawn.mp3 | STD (ZapSplat) |
| music_overworld_joy | Fields of Joy – an upbeat, happy and positive track full of optimism, acoustic guitar, strings, drums, glockenspiel (closest "adventure" feel, world map) | 213 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_dave_miles_fields_of_joy_009.mp3 | STD (Dave Miles) |
| music_adventure_journey | Astral Journey – synthesiser bass, synth arpeggio, strings and high pitched melody deliver a dynamic theme (adventure / sky) | 150 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/audio_hero_Astral-Journey_SIPML_J-0201.mp3 | STD (Audio Hero) |
| music_boss_epic_loop | Epic – seamless music loop, fast, driving, dramatic orchestral driven track with drums 7 (boss / chase, seamless) | 20 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_orlamusic_Epic%20007.mp3 | STD (Music For Video) |
| music_boss_epic_loop_2 | Epic – seamless music loop 4 | 18 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_orlamusic_Epic%20004.mp3 | STD (Music For Video) |
| music_space_race | Astro Race – mid tempo electro music with a spacey, fun vibe (sky / time-attack) | 139 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_zapsplat_astro_race.mp3 | STD (ZapSplat) |
| music_menu_easy_cheesy | Easy Cheesy – fun, up-tempo funky retro action arcade game music, great for menu or pause sections | 173 s | https://www.zapsplat.com/wp-content/uploads/2015/music-game/music_zapsplat_easy_cheesy.mp3 | STD (ZapSplat) |
| music_winter_dance | Winter Dance – enchanting orchestral piece, pizzicato plucks, staccato strings and harp, cold winter's day with a happy, magical feel (ice island) | 92 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_zapsplat_winter_dance.mp3 | STD (ZapSplat) |
| music_winter_rabbit | Rabbit's First Snow – an orchestral piece set in winter with a slightly cautious yet carefree tone (ice island alt.) | 38 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_zapsplat_rabbits_first_snow_143.mp3 | STD (ZapSplat) |
| music_spooky_staircase | Haunted Staircase – a dark and creepy subtle track with piano stabs and a descending eerie melody (mildest "spooky", cave/temple) | 84 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_zapsplat_haunted_staircase.mp3 | STD (ZapSplat) |
| music_spooky_trick | Trick or Treat – building horror music with piano riff, dark synthesized elements and orchestral crescendo (probably too scary; audition) | 93 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_zapsplat_trick_or_treat.mp3 | STD (ZapSplat) |
| music_spooky_stinger | Creepy Creep – tension driven, dark and eerie, horror musical bumper, stinger, intro/outro | 25 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_DeepTheme_Audio_Creepy_Creep_10.mp3 | STD (DeepTheme Audio) |
| music_mystery_bed | Game music – repetitive dark mysterious music bed with an airy, lightly tense style (temple / cave underscore) | 136 s | https://www.zapsplat.com/wp-content/uploads/2015/music-game/music_zapsplat_game_music_mystery_underscore_airy_dark_tension_006.mp3 | STD (ZapSplat) |
| music_calm_night_1 | Game music – children's game, calm, soft and caring arpeggios, sweet and cute, nighttime (night level / results) | 164 s | https://www.zapsplat.com/wp-content/uploads/2015/music-game/music_zapsplat_game_music_childrens_soft_arp_warm_fun_001.mp3 | STD (ZapSplat) |
| music_calm_plucked | Game music – children's game, calm, soft slow arpeggios with a plucked twinkling feel (crystal cave) | 165 s | https://www.zapsplat.com/wp-content/uploads/2015/music-game/music_zapsplat_game_music_childrens_calm_slow_arpeggio_plucked_soft_warm_caring_005.mp3 | STD (ZapSplat) |
| music_calm_guitar | Game music – children's game, soft, warm and sincere, picked guitar, warm arpeggios, glockenspiel melody | 156 s | https://www.zapsplat.com/wp-content/uploads/2015/music-game/music_zapsplat_game_music_childrens_soft_warm_cuddly_calm_015.mp3 | STD (ZapSplat) |
| music_kids_warm_pads | Game music, kids game, soft, warm and slow with piano, warm pads and vocal ah stabs | 99 s | https://www.zapsplat.com/wp-content/uploads/2015/music-game/music_zapsplat_game_music_kids_warm_soft_slow_chilled_piano_bass_warm_pads_vocal_ahs_022.mp3 | STD (ZapSplat) |
| music_chiptune_happy | CRT Skies – royalty free music loop, 8-bit chiptune, simple, happy (bonus / retro level) | 84 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_kulluh_CRT_Skies_022.mp3 | STD (Kulluh) |
| music_chiptune_stardust | Stardust Render – royalty free music loop, simple fun 8-bit chiptune | 55 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_kulluh_Stardust_Render_031.mp3 | STD (Kulluh) |
| music_chiptune_glimmer | Glimmer Moon – royalty free music loop, 8-bit chiptune, simple, game music | 72 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_kulluh_Glimmer_Moon_025.mp3 | STD (Kulluh) |
| music_chiptune_afterglow | 8-Bit Afterglow – royalty free music loop, simple 8-bit chiptune, basic, game | 64 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/music_kulluh_8-Bit_Afterglow_019.mp3 | STD (Kulluh) |
| music_merry_go_round | Merry Go Round – merry go round style children's music with a bright twinkly melody | 149 s | https://www.zapsplat.com/wp-content/uploads/2015/music-one/audio_hero_Merry-Go-Round_SIPML_Q-0145.mp3 | STD (Audio Hero) |

### Suggested per-theme mapping

| theme | music | ambience |
|---|---|---|
| Title / level select | music_menu_cheeky_monkey or music_overworld_joy | existing amb_waves |
| Grass island (current) | music_island_loop (Happy 004) | existing amb_birds + amb_waves |
| Beach / tropical | music_tropical_steel | amb_waves + wind_breeze |
| Jungle | music_tropical_banana or music_tropical_showtell | amb_jungle_day |
| Sky islands | music_tropical_dawn or music_adventure_journey | wind_sky_loop |
| Ice / snow | music_winter_dance | snow_wind_loop_1 (quiet) |
| Lava / volcano | music_boss_epic_loop (chase) or music_space_race | lava_flow_loop + lava_bubbles_loop + lava_rumble_loop |
| Cave / crystal | music_calm_plucked | amb_cave_drips |
| Temple / ruins | music_mystery_bed or music_spooky_staircase (quiet) | amb_cave_wind + amb_temple_airy |
| Boss | music_boss_epic_loop | — |
| Pause | pause_music_loop | — |

## Gaps / caveats

- Premium-only (GOLD): the cleanest GameMaster Audio ice cracks and metal-ball loop, SmartSound volcano/campfire loops, Epic Stock Media "heal"/"star pick up" tones, Jessey Drake 8-bit pause blip. Free substitutes are listed next to each.
- No free dedicated "spike trap", "temple ambience", "confetti cannon", or "geyser" one-shots; combinations are suggested above.
- "Adventure" music search only surfaces rock/drum tracks; the closest cheerful options are Fields of Joy, Astral Journey and Tropical Dawn.
- Zapsplat's free tier limits downloads per day for logged-in users; the preview mp3 URLs above are what the player streams and need no login (same method as the existing `assets/sfx`).
