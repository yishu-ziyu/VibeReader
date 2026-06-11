use vibereader_lib::core::storage::{
    AnnotationInput, AttentionInsightInput, ConversationInput, DocumentInput, FlashcardDeckInput,
    FlashcardInput, SourceIndexStatusInput, SourceSpanInput, Storage, SummaryInput, TaskInput,
    ThinkingTreeInput, VibeCardInput,
};

fn test_vibecard(id: &str, title: &str, user_note: &str, updated_at: i64) -> VibeCardInput {
    VibeCardInput {
        id: id.into(),
        document_id: "doc-1".into(),
        card_type: "concept_card".into(),
        title: title.into(),
        source_text: "Quoted text".into(),
        ai_content: "{\"summary\":\"Summary\"}".into(),
        user_note: user_note.into(),
        page: Some(2),
        paragraph_id: Some("page-2-para-4".into()),
        tags_json: "[\"important\"]".into(),
        source_json: "{\"kind\":\"selection\"}".into(),
        created_at: 400,
        updated_at,
        verification_status: "grounded".into(),
    }
}

#[test]
fn initializes_schema_idempotently() {
    let storage = Storage::open_memory().expect("open memory db");

    storage.init_schema().expect("first init");
    storage.init_schema().expect("second init");

    let documents = storage.list_documents().expect("list documents");
    assert!(documents.is_empty());
}

#[test]
fn upserts_and_lists_documents_newest_first() {
    let storage = Storage::open_memory().expect("open memory db");
    storage.init_schema().expect("init schema");

    storage
        .upsert_document(DocumentInput {
            id: "doc-old".into(),
            name: "Old.pdf".into(),
            kind: "pdf".into(),
            source: "local-file".into(),
            path: Some("/tmp/old.pdf".into()),
            mime_type: "application/pdf".into(),
            size: 10,
            fingerprint: None,
            opened_at: 100,
            updated_at: 100,
            parse_status: "parsed".into(),
        })
        .expect("insert old");
    storage
        .upsert_document(DocumentInput {
            id: "doc-new".into(),
            name: "New.md".into(),
            kind: "markdown".into(),
            source: "browser-upload".into(),
            path: None,
            mime_type: "text/markdown".into(),
            size: 20,
            fingerprint: Some("fp-new".into()),
            opened_at: 200,
            updated_at: 200,
            parse_status: "pending".into(),
        })
        .expect("insert new");

    let documents = storage.list_documents().expect("list documents");
    assert_eq!(documents.len(), 2);
    assert_eq!(documents[0].id, "doc-new");
    assert_eq!(documents[1].id, "doc-old");
    assert_eq!(documents[0].fingerprint.as_deref(), Some("fp-new"));
}

#[test]
fn rejects_document_without_id() {
    let storage = Storage::open_memory().expect("open memory db");
    storage.init_schema().expect("init schema");

    let error = storage
        .upsert_document(DocumentInput {
            id: "".into(),
            name: "No id.pdf".into(),
            kind: "pdf".into(),
            source: "local-file".into(),
            path: None,
            mime_type: "application/pdf".into(),
            size: 10,
            fingerprint: None,
            opened_at: 100,
            updated_at: 100,
            parse_status: "pending".into(),
        })
        .expect_err("empty id should fail");

    assert_eq!(error.code(), "validation_error");
}

#[test]
fn creates_and_lists_annotations_by_document() {
    let storage = Storage::open_memory().expect("open memory db");
    storage.init_schema().expect("init schema");

    storage
        .create_annotation(AnnotationInput {
            id: "annotation-1".into(),
            document_id: "doc-1".into(),
            page: 3,
            paragraph_id: Some("page-3-para-1".into()),
            selected_text: "Important text".into(),
            note: "Check this".into(),
            color: "yellow".into(),
            rect_json: Some("{\"x\":1}".into()),
            created_at: 300,
            updated_at: 300,
        })
        .expect("create annotation");
    storage
        .create_annotation(AnnotationInput {
            id: "annotation-2".into(),
            document_id: "doc-2".into(),
            page: 1,
            paragraph_id: None,
            selected_text: "Other".into(),
            note: "".into(),
            color: "blue".into(),
            rect_json: None,
            created_at: 100,
            updated_at: 100,
        })
        .expect("create other annotation");

    let annotations = storage.list_annotations("doc-1").expect("list annotations");

    assert_eq!(annotations.len(), 1);
    assert_eq!(annotations[0].id, "annotation-1");
    assert_eq!(
        annotations[0].paragraph_id.as_deref(),
        Some("page-3-para-1")
    );
}

#[test]
fn creates_and_lists_vibecards_by_document() {
    let storage = Storage::open_memory().expect("open memory db");
    storage.init_schema().expect("init schema");

    storage
        .create_vibecard(VibeCardInput {
            id: "card-1".into(),
            document_id: "doc-1".into(),
            card_type: "quote".into(),
            title: "Core quote".into(),
            source_text: "Quoted text".into(),
            ai_content: "".into(),
            user_note: "Remember this".into(),
            page: Some(2),
            paragraph_id: Some("page-2-para-4".into()),
            tags_json: "[\"important\"]".into(),
            source_json: "{\"kind\":\"selection\"}".into(),
            created_at: 400,
            updated_at: 400,
            verification_status: "grounded".into(),
        })
        .expect("create card");

    let cards = storage.list_vibecards("doc-1").expect("list cards");

    assert_eq!(cards.len(), 1);
    assert_eq!(cards[0].id, "card-1");
    assert_eq!(cards[0].card_type, "quote");
    assert_eq!(cards[0].verification_status, "grounded");
}

#[test]
fn upserts_vibecards_by_id_for_card_edits() {
    let storage = Storage::open_memory().expect("open memory db");
    storage.init_schema().expect("init schema");

    storage
        .create_vibecard(test_vibecard("card-1", "Original title", "old note", 400))
        .expect("create card");
    let updated = storage
        .create_vibecard(test_vibecard(
            "card-1",
            "Updated title",
            "revised note",
            500,
        ))
        .expect("upsert card");

    let cards = storage.list_vibecards("doc-1").expect("list cards");

    assert_eq!(updated.title, "Updated title");
    assert_eq!(updated.user_note, "revised note");
    assert_eq!(cards.len(), 1);
    assert_eq!(cards[0].id, "card-1");
    assert_eq!(cards[0].updated_at, 500);
}

#[test]
fn deletes_vibecards_by_id() {
    let storage = Storage::open_memory().expect("open memory db");
    storage.init_schema().expect("init schema");

    storage
        .create_vibecard(test_vibecard("card-1", "Card title", "note", 400))
        .expect("create card");

    let deleted = storage.delete_vibecard("card-1").expect("delete card");
    let cards = storage.list_vibecards("doc-1").expect("list cards");

    assert!(deleted);
    assert!(cards.is_empty());
}

#[test]
fn replaces_and_lists_source_spans_by_document() {
    let storage = Storage::open_memory().expect("open memory db");
    storage.init_schema().expect("init schema");

    storage
        .replace_source_spans(
            "doc-1",
            vec![
                SourceSpanInput {
                    id: "span-1".into(),
                    document_id: "doc-1".into(),
                    page: 2,
                    paragraph_id: "page-2-para-0".into(),
                    chunk_id: "page-2-para-0".into(),
                    text: "The identification strategy uses matched controls.".into(),
                    order_index: 0,
                    source_type: "pdf_text".into(),
                    metadata_json: "{\"bbox\":[]}".into(),
                    created_at: 100,
                    updated_at: 100,
                },
                SourceSpanInput {
                    id: "span-2".into(),
                    document_id: "doc-1".into(),
                    page: 3,
                    paragraph_id: "page-3-para-0".into(),
                    chunk_id: "page-3-para-0".into(),
                    text: "Robustness checks compare alternative windows.".into(),
                    order_index: 1,
                    source_type: "pdf_text".into(),
                    metadata_json: "{}".into(),
                    created_at: 100,
                    updated_at: 100,
                },
            ],
        )
        .expect("save spans");
    storage
        .replace_source_spans(
            "doc-2",
            vec![SourceSpanInput {
                id: "span-other".into(),
                document_id: "doc-2".into(),
                page: 1,
                paragraph_id: "page-1-para-0".into(),
                chunk_id: "page-1-para-0".into(),
                text: "Other document content.".into(),
                order_index: 0,
                source_type: "markdown".into(),
                metadata_json: "{}".into(),
                created_at: 100,
                updated_at: 100,
            }],
        )
        .expect("save other spans");

    let spans = storage
        .list_source_spans("doc-1")
        .expect("list source spans");
    assert_eq!(spans.len(), 2);
    assert_eq!(spans[0].id, "span-1");
    assert_eq!(spans[0].paragraph_id, "page-2-para-0");
    assert_eq!(spans[0].metadata_json, "{\"bbox\":[]}");

    storage
        .replace_source_spans(
            "doc-1",
            vec![SourceSpanInput {
                id: "span-replacement".into(),
                document_id: "doc-1".into(),
                page: 4,
                paragraph_id: "page-4-para-0".into(),
                chunk_id: "page-4-para-0".into(),
                text: "Replacement source span.".into(),
                order_index: 0,
                source_type: "ocr".into(),
                metadata_json: "{\"confidence\":0.91}".into(),
                created_at: 200,
                updated_at: 200,
            }],
        )
        .expect("replace spans");

    let replaced = storage
        .list_source_spans("doc-1")
        .expect("list replaced spans");
    assert_eq!(replaced.len(), 1);
    assert_eq!(replaced[0].id, "span-replacement");
    assert_eq!(replaced[0].source_type, "ocr");
    assert_eq!(
        storage
            .list_source_spans("doc-2")
            .expect("list other document spans")
            .len(),
        1
    );
}

#[test]
fn searches_source_spans_with_document_isolation_and_limit() {
    let storage = Storage::open_memory().expect("open memory db");
    storage.init_schema().expect("init schema");

    storage
        .replace_source_spans(
            "doc-1",
            vec![
                SourceSpanInput {
                    id: "span-low".into(),
                    document_id: "doc-1".into(),
                    page: 1,
                    paragraph_id: "page-1-para-0".into(),
                    chunk_id: "page-1-para-0".into(),
                    text: "Identification appears once in the background.".into(),
                    order_index: 0,
                    source_type: "pdf_text".into(),
                    metadata_json: "{}".into(),
                    created_at: 100,
                    updated_at: 100,
                },
                SourceSpanInput {
                    id: "span-high".into(),
                    document_id: "doc-1".into(),
                    page: 2,
                    paragraph_id: "page-2-para-0".into(),
                    chunk_id: "page-2-para-0".into(),
                    text:
                        "The identification strategy explains identification with matched controls."
                            .into(),
                    order_index: 1,
                    source_type: "pdf_text".into(),
                    metadata_json: "{}".into(),
                    created_at: 100,
                    updated_at: 100,
                },
            ],
        )
        .expect("save spans");
    storage
        .replace_source_spans(
            "doc-2",
            vec![SourceSpanInput {
                id: "span-leak".into(),
                document_id: "doc-2".into(),
                page: 1,
                paragraph_id: "page-1-para-0".into(),
                chunk_id: "page-1-para-0".into(),
                text: "The identification strategy in another document must not leak.".into(),
                order_index: 0,
                source_type: "pdf_text".into(),
                metadata_json: "{}".into(),
                created_at: 100,
                updated_at: 100,
            }],
        )
        .expect("save other spans");

    let results = storage
        .search_source_spans("doc-1", "identification strategy", 1)
        .expect("search spans");

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, "span-high");
    assert_eq!(results[0].document_id, "doc-1");
    assert!(storage
        .search_source_spans("doc-1", "   ", 4)
        .expect("empty search")
        .is_empty());
}

#[test]
fn upserts_and_loads_source_index_status_by_document() {
    let storage = Storage::open_memory().expect("open memory db");
    storage.init_schema().expect("init schema");

    let first = storage
        .upsert_source_index_status(SourceIndexStatusInput {
            document_id: "doc-1".into(),
            index_signature: "signature-a".into(),
            span_count: 2,
            indexed_at: 1000,
            updated_at: 1000,
        })
        .expect("insert source index status");
    let second = storage
        .upsert_source_index_status(SourceIndexStatusInput {
            document_id: "doc-1".into(),
            index_signature: "signature-b".into(),
            span_count: 4,
            indexed_at: 2000,
            updated_at: 2000,
        })
        .expect("update source index status");

    let loaded = storage
        .load_source_index_status("doc-1")
        .expect("load source index status")
        .expect("status exists");
    let missing = storage
        .load_source_index_status("doc-missing")
        .expect("load missing source index status");

    assert_eq!(first.index_signature, "signature-a");
    assert_eq!(second.index_signature, "signature-b");
    assert_eq!(loaded.document_id, "doc-1");
    assert_eq!(loaded.index_signature, "signature-b");
    assert_eq!(loaded.span_count, 4);
    assert_eq!(loaded.indexed_at, 2000);
    assert!(missing.is_none());
}

#[test]
fn upserts_loads_and_lists_task_records_by_document() {
    let storage = Storage::open_memory().expect("open memory db");
    storage.init_schema().expect("init schema");

    let pending = storage
        .upsert_task(TaskInput {
            id: "task-1".into(),
            document_id: Some("doc-1".into()),
            task_type: "source_index".into(),
            status: "pending".into(),
            title: "Index source spans".into(),
            progress: 0,
            payload_json: "{\"documentId\":\"doc-1\"}".into(),
            result_json: "".into(),
            error_message: None,
            created_at: 1000,
            updated_at: 1000,
            started_at: None,
            completed_at: None,
            cancelled_at: None,
        })
        .expect("insert pending task");
    let succeeded = storage
        .upsert_task(TaskInput {
            id: "task-1".into(),
            document_id: Some("doc-1".into()),
            task_type: "source_index".into(),
            status: "succeeded".into(),
            title: "Index source spans".into(),
            progress: 100,
            payload_json: "{\"documentId\":\"doc-1\"}".into(),
            result_json: "{\"spanCount\":3}".into(),
            error_message: None,
            created_at: 1000,
            updated_at: 2000,
            started_at: Some(1100),
            completed_at: Some(2000),
            cancelled_at: None,
        })
        .expect("update task");
    storage
        .upsert_task(TaskInput {
            id: "task-other".into(),
            document_id: Some("doc-2".into()),
            task_type: "summary".into(),
            status: "running".into(),
            title: "Summarize".into(),
            progress: 40,
            payload_json: "{}".into(),
            result_json: "".into(),
            error_message: None,
            created_at: 1500,
            updated_at: 1500,
            started_at: Some(1500),
            completed_at: None,
            cancelled_at: None,
        })
        .expect("insert other document task");

    let loaded = storage
        .load_task("task-1")
        .expect("load task")
        .expect("task exists");
    let doc_tasks = storage.list_tasks(Some("doc-1")).expect("list doc tasks");

    assert_eq!(pending.status, "pending");
    assert_eq!(succeeded.status, "succeeded");
    assert_eq!(loaded.id, "task-1");
    assert_eq!(loaded.document_id.as_deref(), Some("doc-1"));
    assert_eq!(loaded.task_type, "source_index");
    assert_eq!(loaded.progress, 100);
    assert_eq!(loaded.result_json, "{\"spanCount\":3}");
    assert_eq!(loaded.created_at, 1000);
    assert_eq!(loaded.updated_at, 2000);
    assert_eq!(loaded.started_at, Some(1100));
    assert_eq!(loaded.completed_at, Some(2000));
    assert_eq!(doc_tasks.len(), 1);
    assert_eq!(doc_tasks[0].id, "task-1");
}

#[test]
fn rejects_task_with_unknown_status() {
    let storage = Storage::open_memory().expect("open memory db");
    storage.init_schema().expect("init schema");

    let error = storage
        .upsert_task(TaskInput {
            id: "task-1".into(),
            document_id: Some("doc-1".into()),
            task_type: "source_index".into(),
            status: "paused".into(),
            title: "Index source spans".into(),
            progress: 0,
            payload_json: "{}".into(),
            result_json: "".into(),
            error_message: None,
            created_at: 1000,
            updated_at: 1000,
            started_at: None,
            completed_at: None,
            cancelled_at: None,
        })
        .expect_err("unknown status should fail");

    assert_eq!(error.code(), "validation_error");
}

#[test]
fn replaces_and_lists_flashcard_decks_by_document() {
    let storage = Storage::open_memory().expect("open memory db");
    storage.init_schema().expect("init schema");

    storage
        .replace_flashcard_decks(
            "doc-1",
            vec![FlashcardDeckInput {
                id: "deck-1".into(),
                document_id: "doc-1".into(),
                title: "Methods".into(),
                created_at: 100,
                updated_at: 200,
                cards: vec![FlashcardInput {
                    id: "flashcard-1".into(),
                    deck_id: "deck-1".into(),
                    document_id: "doc-1".into(),
                    front: "What is the method?".into(),
                    back: "Difference-in-differences.".into(),
                    known: false,
                    unknown: true,
                    created_at: 150,
                    updated_at: 200,
                }],
            }],
        )
        .expect("save decks");
    storage
        .replace_flashcard_decks(
            "doc-2",
            vec![FlashcardDeckInput {
                id: "deck-other".into(),
                document_id: "doc-2".into(),
                title: "Other document".into(),
                created_at: 100,
                updated_at: 100,
                cards: vec![],
            }],
        )
        .expect("save other document decks");

    let decks = storage
        .list_flashcard_decks("doc-1")
        .expect("list flashcard decks");
    assert_eq!(decks.len(), 1);
    assert_eq!(decks[0].id, "deck-1");
    assert_eq!(decks[0].cards.len(), 1);
    assert_eq!(decks[0].cards[0].front, "What is the method?");
    assert!(decks[0].cards[0].unknown);

    storage
        .replace_flashcard_decks("doc-1", vec![])
        .expect("replace with empty decks");
    assert!(storage
        .list_flashcard_decks("doc-1")
        .expect("list replaced decks")
        .is_empty());
    assert_eq!(
        storage
            .list_flashcard_decks("doc-2")
            .expect("list other document decks")
            .len(),
        1
    );
}

#[test]
fn saves_loads_lists_and_deletes_conversations() {
    let storage = Storage::open_memory().expect("open memory db");
    storage.init_schema().expect("init schema");

    storage
        .upsert_conversation(ConversationInput {
            session_id: "session-old".into(),
            document_id: Some("doc-1".into()),
            title: "Old question".into(),
            messages_json: "[{\"role\":\"user\",\"content\":\"old\"}]".into(),
            message_count: 1,
            created_at: 100,
            updated_at: 100,
        })
        .expect("save old conversation");
    storage
        .upsert_conversation(ConversationInput {
            session_id: "session-new".into(),
            document_id: None,
            title: "New question".into(),
            messages_json: "[{\"role\":\"user\",\"content\":\"new\"}]".into(),
            message_count: 1,
            created_at: 200,
            updated_at: 300,
        })
        .expect("save new conversation");

    let loaded = storage
        .load_conversation("session-new")
        .expect("load conversation")
        .expect("conversation exists");
    assert_eq!(loaded.session_id, "session-new");
    assert_eq!(loaded.title, "New question");
    assert_eq!(
        loaded.messages_json,
        "[{\"role\":\"user\",\"content\":\"new\"}]"
    );

    let conversations = storage.list_conversations().expect("list conversations");
    assert_eq!(conversations.len(), 2);
    assert_eq!(conversations[0].session_id, "session-new");
    assert_eq!(conversations[1].session_id, "session-old");

    assert!(storage
        .delete_conversation("session-new")
        .expect("delete conversation"));
    assert!(storage
        .load_conversation("session-new")
        .expect("load deleted conversation")
        .is_none());
    assert_eq!(
        storage
            .list_conversations()
            .expect("list after delete")
            .len(),
        1
    );
}

#[test]
fn upserts_and_loads_thinking_tree_by_document() {
    let storage = Storage::open_memory().expect("open memory db");
    storage.init_schema().expect("init schema");

    storage
        .upsert_thinking_tree(ThinkingTreeInput {
            document_id: "doc-1".into(),
            tree_json: "{\"id\":\"root\",\"children\":[]}".into(),
            created_at: 100,
            updated_at: 100,
        })
        .expect("save thinking tree");
    storage
        .upsert_thinking_tree(ThinkingTreeInput {
            document_id: "doc-1".into(),
            tree_json: "{\"id\":\"root\",\"children\":[{\"id\":\"section-1\"}]}".into(),
            created_at: 100,
            updated_at: 200,
        })
        .expect("replace thinking tree");

    let loaded = storage
        .load_thinking_tree("doc-1")
        .expect("load thinking tree")
        .expect("thinking tree exists");

    assert_eq!(loaded.document_id, "doc-1");
    assert_eq!(loaded.updated_at, 200);
    assert_eq!(
        loaded.tree_json,
        "{\"id\":\"root\",\"children\":[{\"id\":\"section-1\"}]}"
    );
    assert!(storage
        .load_thinking_tree("missing-doc")
        .expect("load missing thinking tree")
        .is_none());
}

#[test]
fn replaces_and_lists_attention_insights_by_document() {
    let storage = Storage::open_memory().expect("open memory db");
    storage.init_schema().expect("init schema");

    storage
        .replace_attention_insights(
            "doc-1",
            vec![
                AttentionInsightInput {
                    id: "insight-1".into(),
                    document_id: "doc-1".into(),
                    insight_type: "method".into(),
                    description: "Method paragraph".into(),
                    page: 2,
                    paragraph_index: 1,
                    paragraph_id: "page-2-para-1".into(),
                    payload_json: "{\"type\":\"method\"}".into(),
                    read_status: "unread".into(),
                    created_at: 100,
                    updated_at: 100,
                },
                AttentionInsightInput {
                    id: "insight-2".into(),
                    document_id: "doc-1".into(),
                    insight_type: "comparison".into(),
                    description: "Comparison paragraph".into(),
                    page: 3,
                    paragraph_index: 0,
                    paragraph_id: "page-3-para-0".into(),
                    payload_json: "{\"type\":\"comparison\"}".into(),
                    read_status: "unread".into(),
                    created_at: 200,
                    updated_at: 200,
                },
            ],
        )
        .expect("save insights");

    let insights = storage
        .list_attention_insights("doc-1")
        .expect("list insights");
    assert_eq!(insights.len(), 2);
    assert_eq!(insights[0].id, "insight-1");
    assert_eq!(insights[1].paragraph_id, "page-3-para-0");

    storage
        .replace_attention_insights(
            "doc-1",
            vec![AttentionInsightInput {
                id: "insight-3".into(),
                document_id: "doc-1".into(),
                insight_type: "innovation".into(),
                description: "Replacement insight".into(),
                page: 1,
                paragraph_index: 0,
                paragraph_id: "page-1-para-0".into(),
                payload_json: "{\"type\":\"innovation\"}".into(),
                read_status: "read".into(),
                created_at: 300,
                updated_at: 300,
            }],
        )
        .expect("replace insights");

    let replaced = storage
        .list_attention_insights("doc-1")
        .expect("list replaced insights");
    assert_eq!(replaced.len(), 1);
    assert_eq!(replaced[0].id, "insight-3");
    assert_eq!(replaced[0].read_status, "read");
    assert!(storage
        .list_attention_insights("doc-2")
        .expect("list other document")
        .is_empty());
}

#[test]
fn upserts_and_lists_summaries_by_document() {
    let storage = Storage::open_memory().expect("open memory db");
    storage.init_schema().expect("init schema");

    storage
        .upsert_summary(SummaryInput {
            id: "summary-1".into(),
            document_id: "doc-1".into(),
            summary_kind: "section".into(),
            section_id: Some("section-0".into()),
            section_title: "Introduction".into(),
            summary: "Initial summary".into(),
            key_points_json: "[\"point A\"]".into(),
            raw_response: "raw initial".into(),
            created_at: 100,
            updated_at: 100,
        })
        .expect("save summary");
    storage
        .upsert_summary(SummaryInput {
            id: "summary-1-replacement".into(),
            document_id: "doc-1".into(),
            summary_kind: "section".into(),
            section_id: Some("section-0".into()),
            section_title: "Introduction".into(),
            summary: "Updated summary".into(),
            key_points_json: "[\"point B\",\"point C\"]".into(),
            raw_response: "raw updated".into(),
            created_at: 100,
            updated_at: 200,
        })
        .expect("replace summary for same section");
    storage
        .upsert_summary(SummaryInput {
            id: "summary-2".into(),
            document_id: "doc-2".into(),
            summary_kind: "section".into(),
            section_id: Some("section-0".into()),
            section_title: "Other".into(),
            summary: "Other document".into(),
            key_points_json: "[]".into(),
            raw_response: "".into(),
            created_at: 150,
            updated_at: 150,
        })
        .expect("save other document summary");

    let summaries = storage.list_summaries("doc-1").expect("list summaries");
    assert_eq!(summaries.len(), 1);
    assert_eq!(summaries[0].id, "summary-1-replacement");
    assert_eq!(summaries[0].section_id.as_deref(), Some("section-0"));
    assert_eq!(summaries[0].summary, "Updated summary");
    assert_eq!(summaries[0].key_points_json, "[\"point B\",\"point C\"]");

    let loaded = storage
        .load_summary("doc-1", "section", Some("section-0"))
        .expect("load summary")
        .expect("summary exists");
    assert_eq!(loaded.summary, "Updated summary");
    assert!(storage
        .load_summary("doc-1", "section", Some("missing"))
        .expect("load missing summary")
        .is_none());
}

#[test]
fn builds_markdown_reading_note_export_without_secrets() {
    let storage = Storage::open_memory().expect("open memory db");
    storage.init_schema().expect("init schema");

    storage
        .upsert_document(DocumentInput {
            id: "doc-export".into(),
            name: "Export Paper.pdf".into(),
            kind: "pdf".into(),
            source: "local-file".into(),
            path: Some("/tmp/export-paper.pdf".into()),
            mime_type: "application/pdf".into(),
            size: 42,
            fingerprint: None,
            opened_at: 100,
            updated_at: 100,
            parse_status: "parsed".into(),
        })
        .expect("save document");
    storage
        .upsert_summary(SummaryInput {
            id: "summary-export".into(),
            document_id: "doc-export".into(),
            summary_kind: "section".into(),
            section_id: Some("section-0".into()),
            section_title: "Introduction".into(),
            summary: "The paper studies export behavior.".into(),
            key_points_json: "[\"point one\"]".into(),
            raw_response: "raw model response with no headers".into(),
            created_at: 110,
            updated_at: 110,
        })
        .expect("save summary");
    storage
        .create_annotation(AnnotationInput {
            id: "annotation-export".into(),
            document_id: "doc-export".into(),
            page: 3,
            paragraph_id: Some("page-3-para-1".into()),
            selected_text: "Important source sentence".into(),
            note: "My note".into(),
            color: "yellow".into(),
            rect_json: None,
            created_at: 120,
            updated_at: 120,
        })
        .expect("save annotation");
    storage
        .replace_attention_insights(
            "doc-export",
            vec![AttentionInsightInput {
                id: "insight-export".into(),
                document_id: "doc-export".into(),
                insight_type: "method".into(),
                description: "Read the method first".into(),
                page: 5,
                paragraph_index: 0,
                paragraph_id: "page-5-para-0".into(),
                payload_json: "{}".into(),
                read_status: "unread".into(),
                created_at: 130,
                updated_at: 130,
            }],
        )
        .expect("save insight");
    storage
        .create_vibecard(VibeCardInput {
            id: "vibecard-export".into(),
            document_id: "doc-export".into(),
            card_type: "quote".into(),
            title: "Core quote".into(),
            source_text: "Quoted evidence".into(),
            ai_content: "{}".into(),
            user_note: "Useful later".into(),
            page: Some(6),
            paragraph_id: Some("page-6-para-2".into()),
            tags_json: "[]".into(),
            source_json: "{}".into(),
            created_at: 140,
            updated_at: 140,
            verification_status: "grounded".into(),
        })
        .expect("save vibecard");

    let export = storage
        .export_reading_note("doc-export")
        .expect("build reading note export");

    assert_eq!(export.document.id, "doc-export");
    assert_eq!(export.annotations.len(), 1);
    assert!(export.markdown.contains("# Reading Note"));
    assert!(export.markdown.contains("Export Paper.pdf"));
    assert!(export
        .markdown
        .contains("The paper studies export behavior."));
    assert!(export.markdown.contains("P3"));
    assert!(export.markdown.contains("P5"));
    assert!(export.markdown.contains("Core quote"));
    assert!(!export.markdown.to_lowercase().contains("api key"));
    assert!(!export.markdown.to_lowercase().contains("authorization"));
    assert!(export.json.contains("\"doc-export\""));
}
