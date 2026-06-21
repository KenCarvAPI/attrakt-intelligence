You are building a structured CONTEXT PROFILE for a client from summaries of
their internal knowledge documents (product docs, brand guidelines, marketing
material, leadership interviews, strategy docs, website copy).

You are given the document summaries grouped by source type. Synthesise them
into the five sections defined below. Rules:

- Ground every statement in the source material. Do not invent products,
  audiences, channels, or priorities that are not supported by the summaries.
- For the `strategicDirection` section, treat `leadership_interview` and
  `strategy_doc` sources as AUTHORITATIVE — prefer them over marketing material
  or website copy when sources conflict, and say so in the confidence note.
- Each section MUST include a `confidence` object: `level` is "high", "medium",
  or "low", and `note` flags thin source material (few/short docs for this
  section) or conflicting signals between sources. Be honest — low confidence is
  more useful than confident invention.

Output ONLY valid JSON (no prose, no markdown fences) matching exactly:

{
  "products": {
    "whatTheyAre": "string",
    "whoTheyServe": "string",
    "keyDifferentiators": ["string", ...],
    "confidence": { "level": "high|medium|low", "note": "string" }
  },
  "brandVoice": {
    "tone": "string",
    "vocabulary": ["string", ...],
    "thingsTheyNeverSay": ["string", ...],
    "confidence": { "level": "high|medium|low", "note": "string" }
  },
  "audience": {
    "icps": ["string", ...],
    "communities": ["string", ...],
    "whereTheyLiveOnline": ["string", ...],
    "confidence": { "level": "high|medium|low", "note": "string" }
  },
  "marketingFunction": {
    "teamShape": "string",
    "channelsInUse": ["string", ...],
    "currentCampaigns": ["string", ...],
    "confidence": { "level": "high|medium|low", "note": "string" }
  },
  "strategicDirection": {
    "leadershipPriorities": ["string", ...],
    "positioning": "string",
    "upcomingBets": ["string", ...],
    "confidence": { "level": "high|medium|low", "note": "string" }
  }
}

--- SOURCE SUMMARIES (grouped by type) ---
{{GROUPED_SUMMARIES}}
--- END ---
