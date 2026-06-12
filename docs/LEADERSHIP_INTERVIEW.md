# Leadership Interview Template

A structured interview to run with a client's C-suite (CEO / founder, CMO /
head of marketing, CPO / head of product). The goal is to capture, in their own
words, what the company is building, where it is going, and the boundaries they
will not cross.

**How to use this**

- Run it as a conversation, not a form. Ask the question, then follow the
  threads. The prompts under each question are nudges, not a script.
- Record and transcribe. The transcript is ingested verbatim as a knowledge
  document with `sourceType = leadership_interview`:

  ```
  pnpm knowledge:add --client <slug> --type leadership_interview --file ./interview.md
  ```

- Leadership interviews and strategy docs are treated as **authoritative** for
  the strategic-direction section of the synthesised context profile. Capture
  attribution (who said what) where it matters.

---

## 1. Product vision

> What are you building, and what does the world look like if you win?

- What does the product do today, in one sentence, for someone who has never
  heard of you?
- Who is it for — and just as importantly, who is it *not* for?
- What is the single most important thing it does better than anything else?
- Where does the product go in the next 2–3 years? What is in the product today
  only because it is a stepping stone?

## 2. 12-month priorities

> If we talk again in twelve months, what has to be true for you to call this a
> good year?

- What are the top three priorities for the next 12 months, in order?
- What are you deliberately *not* doing this year, even though it is tempting?
- What is the one bet that, if it pays off, changes the trajectory of the
  company?
- What keeps you up at night about the next 12 months?

## 3. Positioning

> When the right customer describes you to a peer, what do you want them to say?

- Who are your real competitors — including the status quo / "do nothing"?
- What is the category you are in, or the one you are trying to create?
- What do people *misunderstand* about you that you wish they got right?
- What is the proof point you lead with when someone is skeptical?

## 4. Brand & voice

> How should the company sound, and how should it never sound?

- Describe the brand's personality as if it were a person.
- What words, phrases, or claims do you love? Which ones make you cringe?
- What are the things you will **never** say — claims you won't make, tones you
  won't use, topics you stay out of?
- Who are brands you admire for how they communicate, and why?

## 5. Audience & community

> Where do the people who matter to you actually spend their time?

- Who are your ideal customers / users (ICPs)? Describe 2–3 archetypes.
- Which communities, platforms, or channels do they live in online?
- Where does your most valuable word-of-mouth happen today?
- Who are the champions and detractors you already know by name?

## 6. Marketing function

> What does the marketing engine look like right now?

- What does the team look like today — roles, size, in-house vs. agency?
- Which channels are actually working, and which are you doing out of habit?
- What campaigns are live or planned in the next quarter?
- What is the one capability you wish the marketing function had?

## 7. What success looks like

> Beyond the numbers, how will you know it worked?

- What are the metrics you actually watch (and the vanity metrics you ignore)?
- What does success look like for the brand specifically, not just revenue?
- What would make you proud to point at in two years?

## 8. What you will never do

> Where are the hard lines?

- What lines will the company never cross — on product, growth tactics,
  partnerships, messaging?
- What short-term win would you turn down because it conflicts with the
  long-term vision?
- What is a value that sounds nice but you would actually trade away under
  pressure — and what is one you would never trade?

---

### Closing

- Is there a question we should have asked and didn't?
- Who else internally should we talk to to complete the picture?
