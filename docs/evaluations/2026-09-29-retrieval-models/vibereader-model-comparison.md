# VibeReader 本地检索模型先导实测

2026-09-29，Apple M2、24 GB。结论：**当前没有证据支持直接替换生产组合**。Granite 嵌入更小，295 段批量编码明显更快，但 11 题的最终引用命中没有超过现用组合；Qwen 编码更慢。GTE 在安装版 Python 环境中原样推理失败，需要兼容修复。保留现用模型，下一步用更大且人工穷尽相关段的真实 PDF 题集复测，再决定迁移和清理。

## 语料与评法

本机只读 3 份 PDF：仓库 `test-fixtures/acceptance-sample.pdf`（2 页，SHA256 前缀 `9fcb27cab4106b84`）、`YiShu-Archive-Interaction-Design-Plan.pdf`（9 页，`794d4c7d74bb7e00`）、`designing-for-the-future.pdf`（125 页，`8d5d06bd5f3891da`）。后两份是用户本地文件；文档正文未上传或写入报告。按生产 PyMuPDF 解析与 `chunk_document(max_chars=1000)` 得 295 段；生产检索的 dense top15、jieba BM25 top15、合并去重、CrossEncoder top5 顺序保持一致。11 个固定问题有 5 个中文、6 个英文；每题由原文中的唯一完整证据段标注。`zh_zones` 的 GTE top5 已人工复核，没有任何一段给出五分区完整顺序。此标注没有穷尽所有部分相关段，因此 nDCG 是**完整答案证据段**的严格指标。

模型均固定版本：BAAI/bge-m3 `5617a9f`、BAAI/bge-reranker-base `2cfc18c`（从 VibeReader 现有缓存只读）；Qwen3-Embedding-0.6B `97b0c61`、Granite-Embedding-311M-Multilingual-R2 `4439955`、GTE-Multilingual-Reranker-Base `8215cf0`，GTE 的 `new-impl` 代码 `40ced75`。候选权重来自官方 Hugging Face，置于隔离目录。Qwen 查询使用模型 `query` prompt，文档无 prompt；Granite 用其 SentenceTransformer 默认用法；GTE 用官方 CrossEncoder 配对。编码单位为固定的 295 段；重排器在每题三款 dense top15 与 BM25 top15 的**同一并集**上比较，平均 32.2 段。全量推理设置 `HF_HUB_OFFLINE=1` 与 `TRANSFORMERS_OFFLINE=1`。

## 质量

| 稠密嵌入 | Recall@1 | Recall@5 | Recall@15 | MRR | 295 段编码 |
| --- | ---: | ---: | ---: | ---: | ---: |
| bge-m3 | 7/11 | 10/11 | 11/11 | 0.727 | 139.31 s |
| Qwen3 0.6B | 7/11 | 11/11 | 11/11 | 0.753 | 412.07 s |
| Granite 311M | 7/11 | 10/11 | 11/11 | 0.742 | 31.66 s |

| 固定候选池重排 | Hit@5 | nDCG@5 | 备注 |
| --- | ---: | ---: | --- |
| bge-reranker-base | 11/11 | 0.865 | 原样运行 |
| GTE multilingual | 10/11 | 0.876 | 隔离评测时重建加载异常的非持久缓冲；安装版原样不可用 |

| 完整检索组合 | 模型文件合计 | top5 完整证据命中 | nDCG@5 |
| --- | ---: | ---: | ---: |
| **现用 bge-m3 + bge-reranker** | 3.192 GiB | **11/11** | 0.865 |
| Qwen3 + GTE | 1.719 GiB | 10/11 | 0.876 |
| Granite + GTE | 1.221 GiB | 10/11 | 0.876 |
| Granite + 现用 bge-reranker | 1.684 GiB | 11/11 | 0.869 |

完整检索结果是从各组合自己的 dense top15 + BM25 top15 取候选，再用相应重排器在固定并集上的分数重新排序。BM25 单独覆盖了 7/11 个证据段，且所有 dense 模型都在 top15 找到全部证据；这个题集在 Hit@5 已接近天花板。Granite + 现用重排器是目前更小、编码更快且不掉这 11 题命中的组合，但**没有测出更强的质量**，且换 embedding 必须重建文档及记忆向量索引。

### 逐题证据段排名

| 题号 | PDF:页 | bge dense | Qwen dense | Granite dense | bge rerank | GTE rerank |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| zh_accept | acceptance:1 | 1 | 1 | 1 | 1 | 1 |
| zh_zones | archive:2 | 6 | 3 | 6 | 5 | 12 |
| zh_mobile | archive:3 | 1 | 4 | 1 | 3 | 1 |
| zh_scrub | archive:3 | 4 | 1 | 1 | 1 | 1 |
| en_gsap | archive:3 | 3 | 5 | 2 | 1 | 2 |
| en_phases | archive:7 | 4 | 1 | 4 | 1 | 1 |
| en_bandwidth | future:11 | 1 | 2 | 1 | 1 | 1 |
| zh_content | future:9 | 1 | 1 | 4 | 1 | 1 |
| en_accessories | future:40 | 1 | 1 | 1 | 2 | 1 |
| en_canvas | future:61 | 1 | 1 | 1 | 1 | 1 |
| en_story | future:90 | 1 | 1 | 1 | 1 | 1 |

中文 dense Recall@5：bge 4/5、Qwen 5/5、Granite 4/5；英文均 6/6。三份 PDF 中英文主题分布不均，尤其中文原文只有两页验收样本且被生产 chunker 合成一段；不能外推到一般中文书籍。逐题原始 ID、候选与排名在 `results/`，问题及短证据锚点在 `eval.py`。

## 本机体积、延迟与内存

| 嵌入模型 | 文件大小 | 新进程加载 | 首次查询 | 后续查询中位 | 进程峰值 RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| bge-m3 | 2.136 GiB | 23.94 s | 0.461 s | 0.255 s | 0.85 GiB |
| Qwen3 0.6B | 1.125 GiB | 4.54 s | 1.010 s | 0.221 s | 0.60 GiB |
| Granite 311M | 0.627 GiB | 1.74 s | 0.415 s | 0.310 s | 1.17 GiB |

| 重排模型 | 文件大小 | 新进程加载 | 首题固定池 | 后续题固定池中位 | 进程峰值 RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| bge-reranker-base | 1.056 GiB | 2.20 s | 1.290 s | 1.266 s | 1.12 GiB |
| GTE multilingual | 0.594 GiB | 1.54 s | 1.609 s | 1.776 s | 1.20 GiB |

这是按顺序运行的新进程加载与热查询，**不是清空系统文件缓存后的冷启动**；首次加载和查询会受前序模型、MPS 编译及系统压力影响。进程峰值 RSS 不包含完整的 MPS 统一内存分配，因此不能据此断言任何组合总体内存更省。重排延迟是在相同固定并集上的可比值，不是各组合实际候选数的端到端延迟。此处基准环境为仓库 `.venv`：sentence-transformers 5.6.0、transformers 5.12.1、torch 2.12.0，默认 MPS。安装版环境另经 smoke 核查。

## 兼容性与失败记录

GTE 固定官方代码做过静态网络调用检查，未发现网络发送。开发 `.venv` 原样加载时，`position_ids` 非持久缓冲出现约 `42949672970…532575944736` 的异常值（正常应为 `0…8191`）；rotary `inv_freq/cos/sin` 缓冲全 0。CPU 与 MPS 的原样推理分别报索引越界。只在隔离评测实例中重建这两类缓冲后，官方 Mars/Venus、中文监督学习与英文 GSAP 三组相关/无关对照都把相关段排在前面；三组分数见 `results/failures.md`。第一次仅修 `position_ids` 得到的 GTE Hit@5=4/11 **无效，已废弃**，上表为两类缓冲都修复后的重跑结果。

安装版 `/Applications/VibeReader.app` 的打包环境是 sentence-transformers 6.1.0、transformers 5.17.0、torch 2.14.0。只读加载同一 GTE 权重时仍见 `position_ids` 巨大随机值、rotary 全 0；原样推理另报 `NewModel` 缺少 `get_extended_attention_mask`。因此 GTE **不能直接替换到当前安装版**。本次没有修改 VibeReader 仓库、App、现用权重或现有索引。

官方 Hub 的 Granite/GTE 大文件下载发生连接超时、TLS 中断和部分传输；在系统代理下按固定 revision 的单文件 `curl -C -` 续传后完成。`safetensors` 格式检查得到 GTE 140 个、Granite 134 个张量。下载时间不计入模型延迟。候选权重测后已清理，保留短脚本、固定题、原始结果与失败记录；复测需重新下载相同 revision。

## 复核路径

脚本：`eval.py`；原始 JSON：同目录 `results/embed_*.json`、`results/rerank_*.json`；失败与命令：`results/failures.md`。`download_candidates.py` 从官方固定 revision 重建隔离权重（需网络且约 2.4 GiB），随后进入 `docs/evaluations/2026-09-29-retrieval-models/` 运行：

```sh
'/Users/mahaoxuan/Desktop/AI 产品/vibereader/services/uni-rag/.venv/bin/python' download_candidates.py
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 PYTHONPATH='/Users/mahaoxuan/Desktop/AI 产品/vibereader/services/uni-rag/src' '/Users/mahaoxuan/Desktop/AI 产品/vibereader/services/uni-rag/.venv/bin/python' eval.py validate
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 PYTHONPATH='/Users/mahaoxuan/Desktop/AI 产品/vibereader/services/uni-rag/src' '/Users/mahaoxuan/Desktop/AI 产品/vibereader/services/uni-rag/.venv/bin/python' eval.py embed bge  # qwen / granite 同法，各自独立进程
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 PYTHONPATH='/Users/mahaoxuan/Desktop/AI 产品/vibereader/services/uni-rag/src' '/Users/mahaoxuan/Desktop/AI 产品/vibereader/services/uni-rag/.venv/bin/python' eval.py rerank bge_rerank  # gte_rerank 同法
```

官方模型页：[bge-m3](https://huggingface.co/BAAI/bge-m3)、[Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B)、[Granite 311M R2](https://huggingface.co/ibm-granite/granite-embedding-311m-multilingual-r2)、[GTE reranker](https://huggingface.co/Alibaba-NLP/gte-multilingual-reranker-base)。不同公开评测的任务、语料和指标不一致；本机数据也不足以宣称某候选“实力更强”。
