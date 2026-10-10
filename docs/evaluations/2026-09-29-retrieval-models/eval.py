"""Disposable, offline VibeReader retrieval comparison. Run from any directory."""
import argparse
import json
import re
import resource
import time
from pathlib import Path

import fitz
import numpy as np
import torch
from rank_bm25 import BM25Okapi
import jieba
from sentence_transformers import CrossEncoder, SentenceTransformer

ROOT = Path(__file__).parent
VIBE = Path('/Users/mahaoxuan/Desktop/AI 产品/vibereader')
SOURCES = {
    'acceptance': VIBE / 'test-fixtures/acceptance-sample.pdf',
    'archive': Path('/Users/mahaoxuan/Downloads/项目与数据/YiShu-Archive-Interaction-Design-Plan.pdf'),
    'future': Path('/Users/mahaoxuan/Downloads/项目与数据/designing-for-the-future.pdf'),
}
BASE_HUB = Path('/Users/mahaoxuan/Library/Application Support/VibeReader/unirag-models/hub')
CACHE_HUB = ROOT / 'cache/hub'
MODELS = {
    'bge': BASE_HUB / 'models--BAAI--bge-m3/snapshots/5617a9f61b028005a4858fdac845db406aefb181',
    'qwen': CACHE_HUB / 'models--Qwen--Qwen3-Embedding-0.6B/snapshots/97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3',
    'granite': ROOT / 'models/granite',
    'bge_rerank': BASE_HUB / 'models--BAAI--bge-reranker-base/snapshots/2cfc18c9415c912f9d8155881c133215df768a70',
    'gte_rerank': ROOT / 'models/gte',
}
QUESTIONS = [
    ('zh_accept', '什么是监督学习？', 'acceptance', '监督学习（supervised learning）'),
    ('zh_zones', 'YiShu Archive 的五个滚动分区依次是什么？', 'archive', 'Hero → Projects → Writing → Lab → About'),
    ('zh_mobile', '移动端的导航布局如何安排？', 'archive', 'Mobile: top bar with name'),
    ('zh_scrub', '滚动动效里哪些地方才适合使用 scrub？', 'archive', 'only for parallax backgrounds'),
    ('en_gsap', 'What powers the scroll animations in the proposed site?', 'archive', 'Use GSAP ScrollTrigger as the animation backbone'),
    ('en_phases', 'How many deployable build phases does the plan propose?', 'archive', 'Ship in three phases'),
    ('en_bandwidth', 'What happens to connected devices that consume too much bandwidth?', 'future', 'devices using too much bandwidth will experience'),
    ('zh_content', '在联网设备时代，技术价值从硬件转向了什么？', 'future', 'value lies in user-generated content'),
    ('en_accessories', 'How could OP-1 users get replacement accessories at lower cost?', 'future', 'Shapeways  service at significantly lower cost'),
    ('en_canvas', 'Why must design shops bridge design and technology?', 'future', 'Photoshop isn’t the canvas, the technology is'),
    ('en_story', 'Which stage of a story is the point of maximum friction?', 'future', 'Crisis: The story culminates at the point of maximum'),
]

def norm(text):
    return re.sub(r'\s+', ' ', text).casefold()

def corpus():
    import sys
    sys.path.insert(0, str(VIBE / 'services/uni-rag/src'))
    from uni_rag.ingest.chunker import chunk_document
    chunks = []
    for name, path in SOURCES.items():
        with fitz.open(path) as pdf:
            pages = [(i + 1, p.get_text('text')) for i, p in enumerate(pdf)]
        source_chunks = chunk_document('\n\n'.join(t for _, t in pages), name, max_chars=1000, pages=pages)
        for i, c in enumerate(source_chunks):
            chunks.append({'id': f'{name}:{i}', 'source': name, 'page': c.page_number, 'text': c.text})
    labels = {}
    for qid, _, source, anchor in QUESTIONS:
        gold = [c['id'] for c in chunks if c['source'] == source and norm(anchor) in norm(c['text'])]
        if len(gold) != 1:
            raise ValueError(f'{qid}: expected exactly one gold chunk for {anchor!r}; got {gold}')
        labels[qid] = gold[0]
    return chunks, labels

def rss_gib():
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 ** 3)

def save(name, data):
    p = ROOT / 'results' / f'{name}.json'
    p.parent.mkdir(exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

def embed(model_name):
    chunks, labels = corpus()
    path = MODELS[model_name]
    t = time.perf_counter()
    model = SentenceTransformer(str(path), local_files_only=True)
    load_seconds = time.perf_counter() - t
    t = time.perf_counter()
    docs = model.encode([c['text'] for c in chunks], batch_size=16, normalize_embeddings=True, show_progress_bar=False)
    document_seconds = time.perf_counter() - t
    prompt = 'query' if model_name == 'qwen' else None
    query_times = []
    rows = []
    for qid, query, _, _ in QUESTIONS:
        t = time.perf_counter()
        qv = model.encode([query], prompt_name=prompt, normalize_embeddings=True, show_progress_bar=False)[0]
        query_times.append(time.perf_counter() - t)
        ranks = np.argsort(-(docs @ qv), kind='stable')
        rows.append({'qid': qid, 'gold': labels[qid], 'top15': [chunks[i]['id'] for i in ranks[:15]], 'gold_rank': int(np.where(ranks == next(j for j,c in enumerate(chunks) if c['id'] == labels[qid]))[0][0]) + 1})
    save(f'embed_{model_name}', {'model': model_name, 'chunks': len(chunks), 'questions': len(QUESTIONS), 'load_seconds': load_seconds, 'document_seconds': document_seconds, 'query_seconds': query_times, 'peak_rss_gib': rss_gib(), 'rows': rows})
    print(model_name, 'chunks', len(chunks), 'load', round(load_seconds, 2), 'docs', round(document_seconds, 2), 'query_median', round(float(np.median(query_times)), 3), 'RSS_GiB', round(rss_gib(), 2), flush=True)

def bm25_candidates(chunks):
    tokens = [list(jieba.cut_for_search(c['text'])) for c in chunks]
    index = BM25Okapi(tokens)
    result = {}
    for qid, query, _, _ in QUESTIONS:
        scores = index.get_scores(list(jieba.cut_for_search(query)))
        ranks = np.argsort(-scores, kind='stable')
        result[qid] = [chunks[i]['id'] for i in ranks[:15] if scores[i] > 0]
    return result

def rerank(model_name):
    chunks, labels = corpus()
    by_id = {c['id']: c for c in chunks}
    embeddings = {m: json.loads((ROOT / 'results' / f'embed_{m}.json').read_text()) for m in ['bge','qwen','granite'] if (ROOT / 'results' / f'embed_{m}.json').exists()}
    bm25 = bm25_candidates(chunks)
    pool = {}
    for i, (qid, _, _, _) in enumerate(QUESTIONS):
        pool[qid] = list(dict.fromkeys([c for m in embeddings for c in embeddings[m]['rows'][i]['top15']] + bm25[qid]))
    t = time.perf_counter()
    model = CrossEncoder(str(MODELS[model_name]), trust_remote_code=model_name == 'gte_rerank', local_files_only=True)
    if model_name == 'gte_rerank':
        # In this dev runtime, loading leaves the remote code's non-persistent
        # position and rotary buffers uninitialized. Repair only this instance.
        embedding_layer = model.model.new.embeddings
        embedding_layer.register_buffer(
            'position_ids',
            torch.arange(model.model.config.max_position_embeddings, device=model.device),
            persistent=False,
        )
        rotary = embedding_layer.rotary_emb
        rotary._set_cos_sin_cache(int(rotary.max_seq_len_cached), model.device, torch.float32)
    load_seconds = time.perf_counter() - t
    rows = []
    latency = []
    for question_index, (qid, query, _, _) in enumerate(QUESTIONS):
        ids = pool[qid]
        t = time.perf_counter()
        scores = model.predict([(query, by_id[x]['text']) for x in ids], batch_size=16, show_progress_bar=False)
        latency.append(time.perf_counter() - t)
        order = np.argsort(-scores, kind='stable')
        score_by_id = {item: float(score) for item, score in zip(ids, scores)}
        pipeline = {}
        for embedding_name, embedding_result in embeddings.items():
            candidates = list(dict.fromkeys(embedding_result['rows'][question_index]['top15'] + bm25[qid]))
            ranked = sorted(candidates, key=lambda item: -score_by_id[item])
            pipeline[embedding_name] = {'top5': ranked[:5], 'gold_rank': ranked.index(labels[qid]) + 1 if labels[qid] in ranked else None, 'candidate_count': len(candidates)}
        rows.append({'qid':qid,'gold':labels[qid],'candidate_count':len(ids),'pool_top5':[ids[i] for i in order[:5]],'pool_gold_rank': next((r + 1 for r,i in enumerate(order) if ids[i] == labels[qid]), None), 'pool_score_gold': float(scores[ids.index(labels[qid])]) if labels[qid] in ids else None, 'pipeline': pipeline})
    save(f'rerank_{model_name}', {'model': model_name,'device':str(model.device),'dtype':str(next(model.model.parameters()).dtype),'compatibility_fix':'reset uninitialized non-persistent position_ids and rotary buffers' if model_name == 'gte_rerank' else None,'load_seconds':load_seconds,'query_seconds':latency,'peak_rss_gib':rss_gib(),'rows':rows,'pool':pool,'bm25':bm25})
    print(model_name,'load',round(load_seconds,2),'rerank_median',round(float(np.median(latency)),2),'RSS_GiB',round(rss_gib(),2),flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['validate','embed','rerank'])
    parser.add_argument('model', nargs='?')
    args = parser.parse_args()
    if args.phase == 'validate':
        c, labels = corpus()
        print('chunks', len(c), 'labels', labels)
    elif args.phase == 'embed': embed(args.model)
    else: rerank(args.model)
