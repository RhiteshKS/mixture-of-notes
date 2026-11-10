---
title: What actually fits in 8 GB
dek: A memory budget for fine-tuning, worked out on paper before anything crashes.
date: 2026-11-03
series: fine-tuning-from-the-inside
part: 1
tags: [LoRA, VRAM]
status: published
---

Before you start a fine-tuning run, it is worth working out whether it can fit. Memory problems show up as an out-of-memory error ten minutes in, and by then the time is gone. A few lines of arithmetic move that failure to the start.

## Where the memory goes

Training holds four things on the GPU at once: the weights, the gradients, the optimizer state, and the activations saved for the backward pass. The first three scale with the parameter count. The activations scale with batch size and sequence length.

For full fine-tuning with mixed precision and AdamW, the usual accounting is 16 bytes per parameter, before any activations:

| Component | Bytes per parameter |
|---|---|
| Weights (fp16 or bf16) | 2 |
| Gradients (fp16 or bf16) | 2 |
| Master weights (fp32) | 4 |
| Adam first moment (fp32) | 4 |
| Adam second moment (fp32) | 4 |
| **Total** | **16** |

```python title=budget.py
def full_ft_gib(params_billion: float) -> float:
    bytes_per_param = 2 + 2 + 4 + 4 + 4
    return params_billion * 1e9 * bytes_per_param / 2**30

for size in (0.5, 1.0, 3.0):
    print(f"{size}B params -> {full_ft_gib(size):.1f} GiB")
```

That prints about 7.5, 14.9 and 44.7 GiB. On an 8 GB card even a 0.5B model has no room left once activations are added. Full fine-tuning is off the table, so the question becomes how to shrink each term.

## Shrinking each term

**Quantize the frozen base.** Loading the base model in 4-bit NF4 stores each weight in about half a byte, so a 1.5B model needs roughly 1 GiB for weights instead of about 2.8 GiB in bf16.

**Train adapters, not weights.** LoRA freezes the base and learns two small matrices per target layer. Gradients and optimizer state exist only for those, so they shrink from billions of values to millions.

**Checkpoint the activations.** Gradient checkpointing recomputes activations during the backward pass instead of storing them. It costs roughly a third more compute and removes most of the activation memory.

```python title=load.py
import torch
from transformers import AutoModelForCausalLM, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

MODEL_ID = "Qwen/Qwen2.5-1.5B-Instruct"

bnb = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID, quantization_config=bnb, device_map={"": 0}
)
model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)

lora = LoraConfig(
    r=16, lora_alpha=32, lora_dropout=0.05,
    target_modules="all-linear", task_type="CAUSAL_LM",
)
model = get_peft_model(model, lora)
model.print_trainable_parameters()
```

## What is left

With those three changes the fixed costs are small. What remains is activations, and you control them with three knobs: micro-batch size, sequence length, and how much of the vocabulary the loss touches at once.

:::tip Watch the logits
The final logits tensor has shape batch x sequence x vocabulary. With a vocabulary around 150,000 tokens, a micro-batch of 4 at 2,048 tokens is about 1.2 billion values. In fp32 that is roughly 4.6 GiB for a single tensor, before its gradient. Shorter sequences, or a smaller micro-batch with gradient accumulation, are the first things to try.
:::

## A checklist before you press run

1. Work out the fixed cost: quantized weights plus adapter state.
2. Pick a micro-batch size and sequence length, then estimate the logits tensor.
3. Turn on gradient checkpointing.
4. Run ten steps and read the peak memory before committing to a long run.

```python title=peak.py
import torch

print(f"peak: {torch.cuda.max_memory_allocated() / 2**30:.2f} GiB")
```

The next post replaces the default loss, which is also where the logits tensor gets interesting.
