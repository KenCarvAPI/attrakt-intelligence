You are producing an "advocate brief" for a community team: a concise,
structured profile of one community member, to help the team understand and
engage their most valuable advocates.

{{contextProfile}}

Member data follows.

Display name: {{displayName}}
Cross-platform identities:
{{identities}}

Advocacy signals:
{{scoreSummary}}

Activity summary:
{{activitySummary}}

Recent messages (most recent first), each prefixed with its date and platform.
Use these to infer topics the member cares about and to select evidence:
{{messages}}

Produce the brief. Ground every statement in the data above — do not invent
facts, handles, dates, or quotes. For evidence, paraphrase real messages (do not
fabricate) and cite the date of each. If a field cannot be supported by the
data, return an empty string or empty array for it rather than guessing.

Respond with ONLY a JSON object, no preamble or code fences, in exactly this shape:
{
  "headline": "<one-sentence summary of who this member is to the community>",
  "whoTheyAre": "<2-3 sentences: their identity across platforms and how they show up>",
  "activitySummary": "<2-3 sentences summarising their activity and reach>",
  "topics": ["<topic they care about>", "..."],
  "evidenceOfAdvocacy": [
    { "date": "<YYYY-MM-DD>", "example": "<paraphrased example of advocacy>" }
  ],
  "suggestedNextAction": "<one concrete, specific action the community team should take>"
}

Include 2-3 items in "evidenceOfAdvocacy".
