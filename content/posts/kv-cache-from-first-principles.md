---
title: The KV cache from first principles
dek: Where the memory goes during generation, with the arithmetic to size it yourself.
date: 2026-10-28
series: moe-inference-on-8gb
part: 1
tags: [KV cache, memory]
status: published
---

During generation, a transformer produces one token at a time. Each new token has to attend to every earlier token, which means it needs the keys and values those tokens produced. Recomputing them at every step would repeat almost all of the work, so they are stored instead. That store is the KV cache.

## The size formula

For each layer, the cache holds one key vector and one value vector per token, for every key-value head:

```text
bytes per token = 2 x layers x kv_heads x head_dim x bytes per value
```

```python title=kv.py
def kv_bytes_per_token(layers, kv_heads, head_dim, dtype_bytes=2):
    return 2 * layers * kv_heads * head_dim * dtype_bytes

per_token = kv_bytes_per_token(layers=28, kv_heads=2, head_dim=128)
print(per_token)                  # 28672 bytes, about 28 KiB
print(per_token * 8192 / 2**20)   # 224.0 MiB for an 8k context
```

The numbers describe a model in the 1.5B class that uses grouped-query attention: 28 layers, 2 key-value heads and a head dimension of 128.

## Why grouped-query attention matters

Standard multi-head attention keeps one key-value head per query head. Grouped-query attention shares each key-value head across several query heads. With 12 query heads and 2 key-value heads, the cache is six times smaller:

| Attention | KV heads | Per token | 8,192 tokens |
|---|---|---|---|
| Multi-head | 12 | 168 KiB | 1.31 GiB |
| Grouped-query | 2 | 28 KiB | 224 MiB |

## Where the time goes

Decoding one token has to read every weight and the whole cache from GPU memory, and it does very little arithmetic with them. The speed limit is memory bandwidth, not compute. A rough ceiling on tokens per second is:

```text
tokens per second = memory bandwidth / bytes read per token
```

For a model whose weights take 3 GB, on a card with 400 GB/s of bandwidth, that is about 133 tokens per second, and the cache adds to the bytes read as the context grows. This is why quantizing the weights speeds up decoding, and why a long context slows it down.

:::note Batch size changes the picture
With batch size 1 the weights are read once per token. With larger batches the same weight read serves many sequences, so throughput rises until compute becomes the limit. The estimate above is for the single-user, local case.
:::

## What changes for MoE models

A mixture-of-experts model replaces each feed-forward block with many experts, and a router picks a few of them per token. That changes the weight story: every expert has to be stored somewhere, even though only a few run for any one token. It does not change the cache, which depends only on the attention layers. The next posts in this series deal with the weight side.
