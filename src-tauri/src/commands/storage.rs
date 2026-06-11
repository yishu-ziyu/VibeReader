use std::fs;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

use crate::core::error::StorageError;
use crate::core::storage::{
    AnnotationInput, AnnotationRecord, AttentionInsightInput, AttentionInsightRecord,
    ConversationInput, ConversationRecord, DocumentInput, DocumentRecord, FlashcardDeckInput,
    FlashcardDeckRecord, ReadingNoteExport, ReadingNoteImportResult, SourceIndexStatusInput,
    SourceIndexStatusRecord, SourceSpanInput, SourceSpanRecord, Storage, SummaryInput,
    SummaryRecord, TaskInput, TaskRecord, ThinkingTreeInput, ThinkingTreeRecord, VibeCardInput,
    VibeCardRecord,
};

#[derive(Default)]
pub struct StorageState {
    storage: Mutex<Option<Storage>>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInitResult {
    pub initialized: bool,
    pub path: String,
}

pub(crate) fn command_error_from_storage_error(error: StorageError) -> CommandError {
    CommandError {
        code: error.code().to_string(),
        message: error.message().to_string(),
    }
}

fn command_error(code: &str, message: impl Into<String>) -> CommandError {
    CommandError {
        code: code.to_string(),
        message: message.into(),
    }
}

fn with_storage<T>(
    state: &State<'_, StorageState>,
    work: impl FnOnce(&Storage) -> Result<T, StorageError>,
) -> Result<T, CommandError> {
    let guard = state
        .storage
        .lock()
        .map_err(|_| command_error("storage_lock_error", "Storage lock is unavailable"))?;
    let storage = guard.as_ref().ok_or_else(|| {
        command_error(
            "storage_not_initialized",
            "Storage has not been initialized",
        )
    })?;
    work(storage).map_err(command_error_from_storage_error)
}

#[tauri::command]
pub fn storage_init(
    app: AppHandle,
    state: State<'_, StorageState>,
) -> Result<StorageInitResult, CommandError> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| command_error("app_data_dir_error", error.to_string()))?;
    fs::create_dir_all(&data_dir)
        .map_err(|error| command_error("storage_directory_error", error.to_string()))?;
    let db_path = data_dir.join("vibereader.sqlite3");

    let storage = Storage::open(&db_path).map_err(command_error_from_storage_error)?;
    storage
        .init_schema()
        .map_err(command_error_from_storage_error)?;

    let mut guard = state
        .storage
        .lock()
        .map_err(|_| command_error("storage_lock_error", "Storage lock is unavailable"))?;
    *guard = Some(storage);

    Ok(StorageInitResult {
        initialized: true,
        path: db_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn storage_upsert_document(
    state: State<'_, StorageState>,
    input: DocumentInput,
) -> Result<DocumentRecord, CommandError> {
    with_storage(&state, |storage| storage.upsert_document(input))
}

#[tauri::command]
pub fn storage_list_documents(
    state: State<'_, StorageState>,
) -> Result<Vec<DocumentRecord>, CommandError> {
    with_storage(&state, Storage::list_documents)
}

#[tauri::command]
pub fn storage_create_annotation(
    state: State<'_, StorageState>,
    input: AnnotationInput,
) -> Result<AnnotationRecord, CommandError> {
    with_storage(&state, |storage| storage.create_annotation(input))
}

#[tauri::command]
pub fn storage_list_annotations(
    state: State<'_, StorageState>,
    document_id: String,
) -> Result<Vec<AnnotationRecord>, CommandError> {
    with_storage(&state, |storage| storage.list_annotations(&document_id))
}

#[tauri::command]
pub fn storage_create_vibecard(
    state: State<'_, StorageState>,
    input: VibeCardInput,
) -> Result<VibeCardRecord, CommandError> {
    with_storage(&state, |storage| storage.create_vibecard(input))
}

#[tauri::command]
pub fn storage_delete_vibecard(
    state: State<'_, StorageState>,
    id: String,
) -> Result<bool, CommandError> {
    with_storage(&state, |storage| storage.delete_vibecard(&id))
}

#[tauri::command]
pub fn storage_list_vibecards(
    state: State<'_, StorageState>,
    document_id: String,
) -> Result<Vec<VibeCardRecord>, CommandError> {
    with_storage(&state, |storage| storage.list_vibecards(&document_id))
}

#[tauri::command]
pub fn storage_replace_flashcard_decks(
    state: State<'_, StorageState>,
    document_id: String,
    decks: Vec<FlashcardDeckInput>,
) -> Result<Vec<FlashcardDeckRecord>, CommandError> {
    with_storage(&state, |storage| {
        storage.replace_flashcard_decks(&document_id, decks)
    })
}

#[tauri::command]
pub fn storage_list_flashcard_decks(
    state: State<'_, StorageState>,
    document_id: String,
) -> Result<Vec<FlashcardDeckRecord>, CommandError> {
    with_storage(&state, |storage| storage.list_flashcard_decks(&document_id))
}

#[tauri::command]
pub fn storage_upsert_conversation(
    state: State<'_, StorageState>,
    input: ConversationInput,
) -> Result<ConversationRecord, CommandError> {
    with_storage(&state, |storage| storage.upsert_conversation(input))
}

#[tauri::command]
pub fn storage_load_conversation(
    state: State<'_, StorageState>,
    session_id: String,
) -> Result<Option<ConversationRecord>, CommandError> {
    with_storage(&state, |storage| storage.load_conversation(&session_id))
}

#[tauri::command]
pub fn storage_list_conversations(
    state: State<'_, StorageState>,
) -> Result<Vec<ConversationRecord>, CommandError> {
    with_storage(&state, Storage::list_conversations)
}

#[tauri::command]
pub fn storage_delete_conversation(
    state: State<'_, StorageState>,
    session_id: String,
) -> Result<bool, CommandError> {
    with_storage(&state, |storage| storage.delete_conversation(&session_id))
}

#[tauri::command]
pub fn storage_upsert_thinking_tree(
    state: State<'_, StorageState>,
    input: ThinkingTreeInput,
) -> Result<ThinkingTreeRecord, CommandError> {
    with_storage(&state, |storage| storage.upsert_thinking_tree(input))
}

#[tauri::command]
pub fn storage_load_thinking_tree(
    state: State<'_, StorageState>,
    document_id: String,
) -> Result<Option<ThinkingTreeRecord>, CommandError> {
    with_storage(&state, |storage| storage.load_thinking_tree(&document_id))
}

#[tauri::command]
pub fn storage_replace_attention_insights(
    state: State<'_, StorageState>,
    document_id: String,
    insights: Vec<AttentionInsightInput>,
) -> Result<Vec<AttentionInsightRecord>, CommandError> {
    with_storage(&state, |storage| {
        storage.replace_attention_insights(&document_id, insights)
    })
}

#[tauri::command]
pub fn storage_list_attention_insights(
    state: State<'_, StorageState>,
    document_id: String,
) -> Result<Vec<AttentionInsightRecord>, CommandError> {
    with_storage(&state, |storage| {
        storage.list_attention_insights(&document_id)
    })
}

#[tauri::command]
pub fn storage_upsert_summary(
    state: State<'_, StorageState>,
    input: SummaryInput,
) -> Result<SummaryRecord, CommandError> {
    with_storage(&state, |storage| storage.upsert_summary(input))
}

#[tauri::command]
pub fn storage_load_summary(
    state: State<'_, StorageState>,
    document_id: String,
    summary_kind: String,
    section_id: Option<String>,
) -> Result<Option<SummaryRecord>, CommandError> {
    with_storage(&state, |storage| {
        storage.load_summary(&document_id, &summary_kind, section_id.as_deref())
    })
}

#[tauri::command]
pub fn storage_list_summaries(
    state: State<'_, StorageState>,
    document_id: String,
) -> Result<Vec<SummaryRecord>, CommandError> {
    with_storage(&state, |storage| storage.list_summaries(&document_id))
}

#[tauri::command]
pub fn storage_export_reading_note(
    state: State<'_, StorageState>,
    document_id: String,
) -> Result<ReadingNoteExport, CommandError> {
    with_storage(&state, |storage| storage.export_reading_note(&document_id))
}

#[tauri::command]
pub fn storage_import_reading_note_json(
    state: State<'_, StorageState>,
    json: String,
) -> Result<ReadingNoteImportResult, CommandError> {
    with_storage(&state, |storage| storage.import_reading_note_json(&json))
}

#[tauri::command]
pub fn storage_replace_source_spans(
    state: State<'_, StorageState>,
    document_id: String,
    spans: Vec<SourceSpanInput>,
) -> Result<Vec<SourceSpanRecord>, CommandError> {
    with_storage(&state, |storage| {
        storage.replace_source_spans(&document_id, spans)
    })
}

#[tauri::command]
pub fn storage_list_source_spans(
    state: State<'_, StorageState>,
    document_id: String,
) -> Result<Vec<SourceSpanRecord>, CommandError> {
    with_storage(&state, |storage| storage.list_source_spans(&document_id))
}

#[tauri::command]
pub fn storage_search_source_spans(
    state: State<'_, StorageState>,
    document_id: String,
    query: String,
    limit: i64,
) -> Result<Vec<SourceSpanRecord>, CommandError> {
    with_storage(&state, |storage| {
        storage.search_source_spans(&document_id, &query, limit)
    })
}

#[tauri::command]
pub fn storage_upsert_source_index_status(
    state: State<'_, StorageState>,
    input: SourceIndexStatusInput,
) -> Result<SourceIndexStatusRecord, CommandError> {
    with_storage(&state, |storage| storage.upsert_source_index_status(input))
}

#[tauri::command]
pub fn storage_load_source_index_status(
    state: State<'_, StorageState>,
    document_id: String,
) -> Result<Option<SourceIndexStatusRecord>, CommandError> {
    with_storage(&state, |storage| {
        storage.load_source_index_status(&document_id)
    })
}

#[tauri::command]
pub fn storage_upsert_task(
    state: State<'_, StorageState>,
    input: TaskInput,
) -> Result<TaskRecord, CommandError> {
    with_storage(&state, |storage| storage.upsert_task(input))
}

#[tauri::command]
pub fn storage_load_task(
    state: State<'_, StorageState>,
    id: String,
) -> Result<Option<TaskRecord>, CommandError> {
    with_storage(&state, |storage| storage.load_task(&id))
}

#[tauri::command]
pub fn storage_list_tasks(
    state: State<'_, StorageState>,
    document_id: Option<String>,
) -> Result<Vec<TaskRecord>, CommandError> {
    with_storage(&state, |storage| storage.list_tasks(document_id.as_deref()))
}

#[cfg(test)]
mod tests {
    use crate::commands::storage::command_error_from_storage_error;
    use crate::core::error::StorageError;

    #[test]
    fn maps_storage_error_to_serializable_command_error() {
        let error = command_error_from_storage_error(StorageError::Validation("bad input".into()));

        assert_eq!(error.code, "validation_error");
        assert_eq!(error.message, "bad input");
    }
}
