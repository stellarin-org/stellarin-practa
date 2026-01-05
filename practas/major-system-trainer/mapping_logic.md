```markdown
# Major System Peg Deck — AI Ruleset (Canonical)

This document is the **single source of truth** for generating, scoring, and selecting pegs for a 00–99 Major System deck.

Design goals (in priority order):

1) **Fast decode**: the peg’s first/last consonant sounds should reliably map to the digits.  
2) **High memorability**: pegs should be vivid, concrete, and easy to “see.”  
3) **High associability**: pegs should be easy to *do things with* (interactions/effects), so you can quickly build scenes that bind the peg to whatever you’re memorizing.

This system has two layers:

- **Phonetic Score (`SC`, 0–3)**: strict **gate** for correctness  
- **Mnemonic Rank (`MR`)**: strict **tie-breaker** for memorability + interaction richness

A candidate **must** satisfy `SC >= 2` to be eligible.

---

## 1) Digit → Consonant Sound Mapping (Major System)

> Only **audible consonant phonemes** matter.  
> Vowels are ignored for digit matching.

| Digit | Consonant phoneme class | Common spellings |
|------:|--------------------------|------------------|
| 0 | **S/Z** | s, z, soft c |
| 1 | **T/D/TH** | t, d, th |
| 2 | **N** | n |
| 3 | **M** | m |
| 4 | **R** | r |
| 5 | **L** | l |
| 6 | **Sh/Ch/J/Zh** | sh, ch, j, soft g (gi/ge) |
| 7 | **K/G (hard)** | k, hard c, hard g, q |
| 8 | **F/V/Ph** | f, v, ph |
| 9 | **P/B** | p, b |

### ARPAbet-friendly mapping (recommended if using CMU dict)
- 0: `S`, `Z`
- 1: `T`, `D`, `TH`, `DH`
- 2: `N`
- 3: `M`
- 4: `R`
- 5: `L`
- 6: `SH`, `CH`, `JH`, `ZH`
- 7: `K`, `G`
- 8: `F`, `V`
- 9: `P`, `B`

---

## 2) Candidate Normalization & Pronunciation

### 2.1 How to choose a pronunciation
Preferred order:

1) Use a pronunciation dictionary (CMU/IPA/ARPAbet).
2) If multiple pronunciations exist:
   - Compute `SC` for each pronunciation
   - Pick the pronunciation that **maximizes `SC`**
   - If tied, pick the one that maximizes `MR`
3) If no dictionary entry exists:
   - Use best-effort heuristic phonetics
   - Set `PR=1` (pronunciation ambiguity risk)

### 2.2 Extract the consonant chain `C`
From the chosen pronunciation:

- Remove vowels
- Keep **audible consonant phonemes** in order
- Map each consonant phoneme to a Major class label

Store `C` as hyphen-separated labels, e.g.:
- `mirror` → `C:M-R-R`
- `noose` → `C:N-S`
- `cheetah` → `C:Sh-T`

---

## 3) Phonetic Score (`SC`) — Strict Gate (0–3)

### 3.1 Inputs
Given target number `XY`:

- `FD` = expected first-digit consonant class for `X`
- `LD` = expected last-digit consonant class for `Y`
- `C`  = consonant class chain

### 3.2 Flags and counters

- `FM` (0/1): first-match  
  `FM = 1` iff first element of `C` equals `FD`

- `LM` (0/1): last-match  
  `LM = 1` iff last element of `C` equals `LD`

- `EX` (integer ≥ 0): extras  
  `EX = count of elements in C that are NOT FD and NOT LD`

### 3.3 Reinforcement bonus (`RL`)
We track two reinforcement types for auditability:

#### `RLP` (0/1): phoneme reinforcement
`RLP = 1` iff:
- `LM = 1`, and
- `LD` appears **at least twice** in `C` (as phoneme classes)

Examples:
- `mirror` → `M-R-R` (LD=R) ⇒ `RLP=1`
- `kick`   → `K-K`   (LD=K) ⇒ `RLP=1`
- `toad`   → `T-T`   (T + D both map to class `T`) ⇒ `RLP=1`

#### `RLG` (0/1): grapheme reinforcement at the end
`RLG = 1` iff the **spelling ends in a double consonant letter** that maps to `LD`, ignoring a trailing silent `e`.

Procedure:
1) If word ends with `e` and the `e` is silent, drop it for this check.
2) If the resulting last two letters are the **same consonant** and that consonant maps to `LD`, then `RLG=1`.

Examples:
- `toss` ends `ss` (LD=S) ⇒ `RLG=1`
- `doll` ends `ll` (LD=L) ⇒ `RLG=1`
- `puff` ends `ff` (LD=F) ⇒ `RLG=1`

#### `RL` (0/1)
`RL = max(RLP, RLG)`

### 3.4 Compute `SC`
```

SC_raw = FM + LM + RL - EX
SC     = clamp(SC_raw, 0, 3)

```

### 3.5 Gate rule
Candidate is eligible iff:
- `SC >= 2`

---

## 4) Mnemonic Rank (`MR`) — Memorability + Interaction Tie-Break

`MR` is only used to rank candidates that already pass `SC >= 2`.

### 4.1 Mnemonic fields

#### `IM` (0–3): imagery strength
- 0 = abstract (pure, near, fame)
- 1 = weakly imageable (team, name)
- 2 = concrete object/scene (nail, chair, rope)
- 3 = vivid/unique/cinematic (gnome, mummy, knife, cheetah)

#### `DS` (0–2): deck distinctiveness
- 0 = easily confused with other pegs (tin/tan, fame/foam)
- 1 = moderately distinct
- 2 = highly distinct (gnome, mummy, cheetah)

#### `AC` (0/1): actionability (verb / implies motion)
- 1 if verb or strongly action-implying (kick, toss, chop, push)
- 0 otherwise

#### `SV` (0–2): sensory/visceral punch
- 0 = neutral
- 1 = tactile/food/body/texture (tofu, moss, fur, leaf)
- 2 = edgy/visceral (noose, arse, piss, poop) — especially useful for **Alt** pegs

#### `PO` (0/1): part-of-speech preference
- 1 if noun or verb
- 0 if adjective/adverb/grammatical modifier

#### `IA` (0–2): interactability / manipulability (NEW)
“How easily can I imagine my hands interacting with it?”

- 0 = not hand-interactable / abstract / environment-scale
  - examples: near, fame, (often) rain, moon
- 1 = interactable but mostly a single obvious interaction
  - examples: door (open/close), chair (sit), shell (pick up)
- 2 = clearly hand-manipulable (tool/toy/container/food you handle)
  - examples: tape, knife, coin, rope, cap, mug, bell, peach

> If the word is primarily an adjective/adverb, `IA` is usually 0.

#### `FX` (0–2): interaction effects (NEW)
“When you interact with it (or perform it), does it cause a vivid effect/state change?”

- 0 = no distinctive effect
- 1 = one clear effect
  - examples: top (spin), bell (ring), door (swing)
- 2 = multiple or highly distinctive effects
  - examples: tape (stick/wrap/tear/peel), knife (slice/stab/carve), fire (burn/spread), rope (tie/swing/yank)

#### Penalties
- `PN` (0/1): proper noun penalty (Rome, Nero, Nina)
- `PL` (0/1): plural/grammatical awkwardness penalty (peas, toes, “near”)
- `PR` (0/1): pronunciation ambiguity penalty (variant pronunciations OR heuristic-only pronunciation)

### 4.2 `MR` computation (UPDATED)
```

MR = 2*IM + DS + IA + FX + AC + SV + PO - PN - PL - PR

```

---

## 5) Optional Interaction Verbs (`IV`) — Scene Generator Fuel (NEW)

Store 1–3 canonical interaction verbs per word:

- For nouns: verbs describing how you use/handle it  
  - tape → `IV:wrap,stick,tear`
  - rope → `IV:tie,swing,yank`
  - knife → `IV:slice,stab,carve`

- For verbs: the verb itself + 0–2 effect verbs  
  - toss → `IV:toss,flip,throw`
  - kick → `IV:kick,boot,slam`

`IV` is not required for `SC` or `MR`, but it makes downstream mnemonic-scene generation dramatically easier and more consistent.

---

## 6) Selection Rules (Primary vs Alt)

### 6.1 Candidate generation
Generate a pool of candidate words per number using any source(s). For each candidate, compute:

- `C, FD, LD, FM, LM, EX, RLP, RLG, RL, SC`
- If `SC >= 2`, also compute mnemonic fields and `MR`

### 6.2 Primary selection
Choose candidate that maximizes (descending):

1) `SC`
2) `MR`
3) `IM`
4) `DS`
5) `IA + FX` (interaction richness)
6) shorter word length (minor preference)
7) higher frequency/commonness if available
8) stable alphabetical tie-break

### 6.3 Alt selection (fun/weird/edgy allowed)
Choose a different candidate that maximizes:

1) `SC`
2) `MR + SV`  (explicitly rewards visceral/edge for Alt)
3) `SV`
4) `IM`
5) `DS`
6) same tie-breakers as Primary

### 6.4 Deck-level constraints (hard rules)
Do not use a Primary that is:
- abstract (`IM <= 1`) if there exists an eligible alternative with `IM >= 2`
- proper noun (`PN=1`) if there exists an eligible non-proper-noun alternative
- plural/awkward (`PL=1`) if there exists an eligible singular alternative
- pronunciation-ambiguous (`PR=1`) if there exists a stable alternative

Avoid collisions:
- identical Primary words across numbers are disallowed
- avoid near-homophones across adjacent numbers when possible

---

## 7) Machine-Parsable Infoset Format

Each candidate stores its audit trail as space-delimited `KEY:VALUE` tokens:

Required phonetic keys:
```

C:<seq> FD:<FD> LD:<LD> FM:<0|1> LM:<0|1> EX:<int> RLP:<0|1> RLG:<0|1> RL:<0|1> SC:<0-3>

```

Optional mnemonic keys:
```

IM:<0-3> DS:<0-2> IA:<0-2> FX:<0-2> AC:<0|1> SV:<0-2> PO:<0|1> PN:<0|1> PL:<0|1> PR:<0|1> MR:<int> IV:<v1|v2|v3>

```

### CSV row format (deck line)
One line per number:
```

<number>,<primary_word>,<code>,<SC>,<infoset>,<alt_word>,<code>,<SC>,<infoset>

```

Example:
```

01,seat,ST,2,C:S-T FD:S LD:T FM:1 LM:1 EX:0 RLP:0 RLG:0 RL:0 SC:2,suit,ST,2,C:S-T FD:S LD:T FM:1 LM:1 EX:0 RLP:0 RLG:0 RL:0 SC:2

```

---

## 8) Practical consequence of IA/FX (example)

When two candidates have the same `SC` and similar imagery, prefer the one with higher `IA/FX`.

Example: **19**
- `tape` is more interactable and has richer effects than `top`, so it should outrank as Primary.

Recommended deck line:
```

19,tape,TP,2,C:T-P FD:T LD:P FM:1 LM:1 EX:0 RLP:0 RLG:0 RL:0 SC:2,top,TP,2,C:T-P FD:T LD:P FM:1 LM:1 EX:0 RLP:0 RLG:0 RL:0 SC:2

```
```

If you want, paste the full current 00–99 CSV you’re using (even if it’s “messy”), and I’ll apply these exact rules deterministically and output a **fully updated deck CSV** (same full-infoset style) with any Primary/Alt swaps driven by the new `IA/FX` tie-break.
