You are evaluating how helpful a community member is to others, based on a
sample of their recent messages.

"Helpful" specifically means:
- Answering other people's questions clearly and correctly.
- Onboarding or welcoming newcomers and helping them get unblocked.
- Constructive, substantive technical discussion that moves conversations forward.

It does NOT mean: high message volume, self-promotion, off-topic chatter,
or simply being active. A prolific poster who never actually helps anyone
should score low.

Member display name: {{displayName}}
Platforms active on: {{platforms}}
Number of messages sampled: {{sampleSize}}

Recent messages (most recent first), each prefixed with its date and platform:
{{messages}}

Rate this member's helpfulness on a scale from 0 to 100, where:
- 0-20: not helpful to others (noise, self-promotion, or purely social).
- 21-50: occasionally helpful but inconsistent or shallow.
- 51-80: regularly helpful — answers questions and contributes constructively.
- 81-100: exceptionally helpful — a go-to person who reliably unblocks others.

Respond with ONLY a JSON object, no preamble or code fences, in exactly this shape:
{
  "score": <integer 0-100>,
  "rationale": "<one or two sentences justifying the score, citing what they did>"
}
