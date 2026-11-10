---
title: A one-page template for paper notes
dek: The five questions I answer for every paper, and why the last two matter most.
date: 2026-10-20
series: paper-margins
part: 1
tags: [process]
status: published
---

I read papers faster than I remember them. A fixed template fixes most of that, because it forces the same questions every time and leaves a trail I can search later.

## The template

```text title=paper-note.md
# Title, first author, year
Link:
Read on:

## One sentence
What did they claim, in my words?

## The setup
Model, data, compute, metric. What was held fixed?

## The evidence
Which table or figure carries the claim? Is there an ablation for it?

## What I do not believe yet
The weakest step. What would change my mind?

## What I would try
One experiment that fits on my hardware.
```

## Why these sections

**One sentence.** If I cannot write it, I have not understood the paper yet.

**The setup.** Most disagreements between papers come from differences here: the data, the compute budget and the metric.

**What I do not believe yet.** This is the most useful section later. It turns a summary into a list of experiments.

## Keeping the notes useful

- Write the note within a day of reading.
- Keep it to one page.
- Date it, so you can tell which of your opinions are old.
