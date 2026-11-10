---
title: Why this blog is called Mixture of Notes
dek: The idea behind the name, how the writing is organised, and what to expect.
date: 2026-11-10
tags: [meta]
status: published
---

This blog is a place to write down experiments while they are still fresh. Two threads run in parallel: fine-tuning small language models, and getting mixture-of-experts models to run well on a single 8 GB GPU.

## About the name

In a mixture-of-experts model, a router sends each token to a few specialised experts instead of through the whole network. This blog works the same way. Each topic is routed to the series that handles it: fine-tuning one way, inference another, paper notes a third. Only a few are active at any moment, which suits a blog written on one small GPU.

## Why small hardware

Everything is sized for an 8 GB card. When a run takes minutes instead of days, you change one thing at a time, and you learn what each change actually did.

## How the writing is organised

Posts live in **series**. A series is a sequence of posts that build on each other, like the fine-tuning series that starts with a memory budget and ends with reading a finished run. Standalone posts, like this one, sit outside any series.

:::note How to add a post
Each post is a block of Markdown near the bottom of this file, plus one line in the POSTS list. A post marked as planned shows up in its series as "Planned" until you give it a date, a body and the status "published".
:::

## What to expect

- Fine-tuning experiments, with the code and the memory arithmetic.
- MoE inference: the architecture, expert offloading, quantization and the optimizations from recent papers.
- Reading notes on papers, each with an attempt to reproduce the result on 8 GB.
