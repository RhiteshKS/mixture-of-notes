---
title: Writing your own loss function
dek: Replace the default cross-entropy in a Hugging Face Trainer and keep the training loop honest.
date: 2026-11-07
series: fine-tuning-from-the-inside
part: 2
tags: [loss, Trainer]
status: published
---

The default training loss for a causal language model is cross-entropy averaged over tokens. That is a sensible default, and it is also an assumption: every token matters equally. Sometimes it does not. If you are teaching a model an output format, a handful of tokens carry the signal and the rest is filler.

## The minimal change

In the Hugging Face `Trainer`, the loss lives in one method, `compute_loss`. Override it and everything else (batching, gradient accumulation, logging, checkpointing) keeps working.

```python title=weighted_trainer.py
import torch
import torch.nn.functional as F
from transformers import Trainer

class WeightedLossTrainer(Trainer):
    def __init__(self, *args, token_weights: torch.Tensor, **kwargs):
        super().__init__(*args, **kwargs)
        self.token_weights = token_weights  # shape: [vocab_size]

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.pop("labels")
        outputs = model(**inputs)

        logits = outputs.logits[:, :-1, :].float()
        targets = labels[:, 1:]

        loss = F.cross_entropy(
            logits.reshape(-1, logits.size(-1)),
            targets.reshape(-1),
            weight=self.token_weights.to(logits.device),
            ignore_index=-100,
        )
        return (loss, outputs) if return_outputs else loss
```

Two details are easy to miss. The logits are shifted by one position so that position *t* predicts token *t + 1*. And padding positions carry the label `-100`, which `ignore_index` skips.

## What the weights do to the average

With `weight` set and the default mean reduction, PyTorch divides by the sum of the weights of the tokens that were counted, not by the number of tokens. That keeps the loss on a stable scale, but it also means that doubling every weight changes nothing. Only the ratios matter.

:::note Compare runs carefully
A weighted loss is not comparable to a plain one. When you plot two runs, evaluate both on the same unweighted validation loss, or the curves measure different things.
:::

## Building the weight vector

```python title=weights.py
weights = torch.ones(model.config.vocab_size)
for token in ["<answer>", "</answer>"]:
    weights[tokenizer.convert_tokens_to_ids(token)] = 5.0
```

:::tip Match the output size
Many checkpoints pad the embedding matrix beyond the tokenizer's length. Build the weight vector from `model.config.vocab_size`, not `len(tokenizer)`, or `cross_entropy` will fail with a shape mismatch.
:::

## Sanity checks

1. Set every weight to 1 and confirm the loss matches the default `Trainer` on a few batches.
2. Overfit a single batch and confirm the loss falls toward zero.
3. Print the per-token loss on one held-out example and check that the tokens you up-weighted are the ones you meant.
