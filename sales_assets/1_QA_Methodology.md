# Audio Annotation QA — My Methodology

**Kazuma Sasaki** · Audio Data Quality Lead
kazmike.s@gmail.com · linkedin.com/in/kazumasasaki

---

## What I check

When I audit audio/video annotation data, I review it across five layers.
Each layer has a clear pass/fail bar so feedback is specific and actionable —
never "this feels off."

### 1. Transcription accuracy
- Words match what is actually said, including contractions, elisions, and
  filler words handled consistently
- No invented words (hallucinations) and no dropped words that are clearly audible
- Non-speech sounds (laughter, coughing, etc.) handled by a consistent rule,
  not ad hoc
- Genuinely unclear audio marked as such rather than guessed

### 2. Timestamp precision
- Start/end times aligned to the **audio**, not the video frame
- Tight tolerance (I work to ~100ms on speech, ~200ms on sound events)
- No drift / skew accumulating across a clip
- Same-speaker segments never overlap unless intentionally mixed

### 3. Speaker / source attribution
- Every utterance attributed to the correct speaker, consistently across the clip
- On-screen vs. off-screen vs. narration distinguished correctly
- Sound sources identified (which object, instrument, or person produced it)
- Crowds / un-attributable sounds handled by a defined rule instead of a guess

### 4. Descriptions (speaker + sound)
- Speaker profiles distinct enough to tell people apart unambiguously
- Voice descriptions capture pitch, accent/region, and texture — without
  smuggling in emotion
- Sound descriptions convey *how the sound actually is* (character, volume,
  movement, space), not just a one-word label
- Descriptions avoid hedging ("kind of", "or maybe") and unverifiable claims

### 5. Tags (emotion + delivery)
- Tags supported by the audio, not by what the speaker looks like on screen
- Conservative by default — neutral unless the signal is clear
- No over-tagging of any single category
- Consistent application across the whole task

---

## How I score

I grade each task on a simple, defensible scale and separate **major** issues
(things that corrupt the training signal — wrong timestamps, wrong speaker,
missing/invented words) from **minor** issues (grammar, light over-description).
A task only passes when there are no major issues and minor ones are negligible.

## What you get

For every batch I review, you receive a structured report: per-item findings,
the rule each one violated, and the specific fix — written so an annotator can
act on it without a meeting. The goal is fewer review rounds and a measurably
cleaner dataset.
