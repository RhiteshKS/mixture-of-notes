# Mixture of Notes

**Read the blog: https://rhiteshks.github.io/mixture-of-notes/**

Notes on fine-tuning and serving language models on small hardware. Fine-tuning experiments, mixture-of-experts inference and paper reproductions, written up as series. Everything is meant to run on a single 8 GB GPU unless a post says otherwise.

In a mixture-of-experts model, a router sends each token to a few specialised experts. This blog works the same way: each topic goes to the series that handles it.

## Series

### [Fine-tuning from the inside](https://rhiteshks.github.io/mixture-of-notes/series/fine-tuning-from-the-inside/)
New losses, new heads and new tokens on small language models, with every experiment sized for an 8 GB card. It starts with a memory budget, then replaces the loss, swaps in a new head, adds tokens, and ends with reading a finished run.

### [MoE inference on 8 GB](https://rhiteshks.github.io/mixture-of-notes/series/moe-inference-on-8gb/)
Running mixture-of-experts models as fast as a small card allows: the architecture, the memory budget, expert offloading, quantization and other optimizations, with the arithmetic shown so you can redo it for your own hardware.

### [Paper margins](https://rhiteshks.github.io/mixture-of-notes/series/paper-margins/)
Reading notes in a fixed format: the claim, the setup, the evidence, and the part I do not believe yet. The focus is mixture-of-experts work, and each note ends with an attempt to reproduce the result on an 8 GB card.

### [Build an inference engine](https://rhiteshks.github.io/mixture-of-notes/series/build-an-inference-engine/)
An LLM inference engine written from first principles: the generation loop, prefill and decode, the KV cache and its allocator, prefix caching, attention kernels, quantization, batching and scheduling, and speculative decoding. Every part is measured on a single RTX 5060 with 8 GB.

## Topics

Fine-tuning · LoRA · Mixture of experts · Expert offloading · Quantization · Paper reproductions

## Follow along

- RSS: https://rhiteshks.github.io/mixture-of-notes/feed.xml
- LinkedIn: https://www.linkedin.com/in/rhitesh-kumar-singh
- X: https://x.com/WayofRKS

---

Written by Rhitesh Kumar Singh. The site is built from the Markdown in `content/posts/`. Build notes are in [DEVELOPING.md](DEVELOPING.md).
