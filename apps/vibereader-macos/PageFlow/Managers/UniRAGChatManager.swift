//
//  UniRAGChatManager.swift
//  VibeReader
//
//  Per-tab chat state for the UniRAG Q&A panel: message history, service
//  health, document index status, and the ask/ingest flows.
//

import Foundation
import Observation

struct UniRAGChatMessage: Identifiable, Equatable {
    enum Role: Equatable {
        case user
        case assistant
        case error
    }

    let id = UUID()
    let role: Role
    let text: String
    var citations: [UniRAGCitation] = []
}

/// Drives the right-side Q&A panel for one tab. Owned by `TabSession` so it
/// travels with the tab between windows and tears down on close.
@Observable
@MainActor
final class UniRAGChatManager {
    // MARK: - Observable state

    private(set) var messages: [UniRAGChatMessage] = []
    private(set) var isAsking = false
    private(set) var serviceOnline: Bool?
    /// Index status of the current document. Identity is deduped by fileURL.path;
    /// the status itself is looked up by filename (the backend list contract).
    private(set) var ingestStatus: IngestStatus = .unknown

    enum IngestStatus: Equatable {
        case unknown
        case indexed(chunks: Int)
        case indexing(percent: Int, message: String)
        case failed(String)
    }

    // MARK: - Private

    @ObservationIgnored private let client = UniRAGClient()
    @ObservationIgnored private var sessionId: String?
    @ObservationIgnored private var currentDocumentKey: String?
    @ObservationIgnored private var healthCheckTask: Task<Void, Never>?
    @ObservationIgnored private var ingestPollTask: Task<Void, Never>?

    // MARK: - Lifecycle

    /// Called when the tab's document changes. Resets the conversation, checks
    /// whether the new document is already indexed, and auto-indexes it when
    /// the service is online (M3 ingestion loop — works without the chat panel).
    func documentChanged(filename: String?, fileURL: URL?) {
        let key = fileURL?.path
        guard key != currentDocumentKey else { return }
        currentDocumentKey = key

        messages = []
        sessionId = nil
        ingestStatus = .unknown
        ingestPollTask?.cancel()
        ingestPollTask = nil

        guard let filename, let fileURL else { return }
        Task {
            await refreshIngestStatus(filename: filename)
            guard ingestStatus == .unknown, await client.health() else { return }
            ingestCurrentDocument(fileURL: fileURL)
        }
    }

    func startHealthPolling() {
        guard healthCheckTask == nil else { return }
        healthCheckTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                let online = await self.client.health()
                if !Task.isCancelled {
                    self.serviceOnline = online
                }
                try? await Task.sleep(for: .seconds(online ? 10 : 3))
            }
        }
    }

    func stopHealthPolling() {
        healthCheckTask?.cancel()
        healthCheckTask = nil
    }

    func cleanup() {
        stopHealthPolling()
        ingestPollTask?.cancel()
        ingestPollTask = nil
    }

    // MARK: - Ask

    func ask(_ question: String, selectedText: String?) {
        let trimmed = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isAsking else { return }

        let fullQuestion: String
        if let selectedText, !selectedText.isEmpty {
            fullQuestion = "针对以下选中内容回答：\n「\(selectedText)」\n\n问题：\(trimmed)"
        } else {
            fullQuestion = trimmed
        }

        messages.append(UniRAGChatMessage(role: .user, text: trimmed))
        isAsking = true

        Task {
            do {
                let response = try await client.query(
                    question: fullQuestion,
                    sessionId: sessionId,
                    includeMemory: true
                )
                sessionId = response.sessionId
                messages.append(UniRAGChatMessage(
                    role: .assistant,
                    text: response.answer,
                    citations: response.citations
                ))
            } catch {
                messages.append(UniRAGChatMessage(
                    role: .error,
                    text: error.localizedDescription
                ))
            }
            isAsking = false
        }
    }

    // MARK: - Memory

    /// Saves an assistant answer (with its citations) into long-term memory.
    func saveAnswerAsMemory(question: String, message: UniRAGChatMessage, documentName: String) async -> Bool {
        let nowMs = Int(Date().timeIntervalSince1970 * 1000)
        let payload = UniRAGMemoryPayload(
            artifactId: UUID().uuidString,
            artifactType: "qa",
            title: String(question.prefix(80)),
            document: UniRAGMemoryDocument(id: "", name: documentName, kind: "pdf"),
            verificationStatus: "grounded",
            sourceRefs: message.citations.map { citation in
                UniRAGMemorySourceRef(
                    documentName: citation.source,
                    page: citation.page > 0 ? citation.page : nil,
                    chunkId: citation.chunkId,
                    label: citation.section,
                    text: citation.text
                )
            },
            content: UniRAGMemoryContent(question: question, answer: message.text),
            text: "",
            createdAt: nowMs,
            savedAt: nowMs
        )
        return await save(payload)
    }

    /// Saves selected/highlighted text from the current page into memory.
    func saveSelectionAsMemory(text: String, page: Int, documentName: String) async -> Bool {
        let nowMs = Int(Date().timeIntervalSince1970 * 1000)
        let payload = UniRAGMemoryPayload(
            artifactId: UUID().uuidString,
            artifactType: "highlight",
            title: String(text.prefix(80)),
            document: UniRAGMemoryDocument(id: "", name: documentName, kind: "pdf"),
            verificationStatus: "grounded",
            sourceRefs: [
                UniRAGMemorySourceRef(
                    documentName: documentName,
                    page: page > 0 ? page : nil,
                    chunkId: "",
                    label: "",
                    text: String(text.prefix(200))
                )
            ],
            content: UniRAGMemoryContent(body: text),
            text: "",
            createdAt: nowMs,
            savedAt: nowMs
        )
        return await save(payload)
    }

    private func save(_ payload: UniRAGMemoryPayload) async -> Bool {
        do {
            let result = try await client.saveMemory(payload)
            return result.status == "completed"
        } catch {
            return false
        }
    }

    // MARK: - Ingest

    /// Indexes the current document into UniRAG (upload → poll job status).
    func ingestCurrentDocument(fileURL: URL?) {
        guard let fileURL else { return }
        if case .indexing = ingestStatus { return }

        let filename = fileURL.lastPathComponent
        ingestStatus = .indexing(percent: 0, message: "正在读取文件")

        Task {
            do {
                let data = try Data(contentsOf: fileURL)
                let job = try await client.startIngest(fileData: data, filename: filename)
                await pollIngestJob(jobId: job.jobId)
            } catch {
                ingestStatus = .failed(error.localizedDescription)
            }
        }
    }

    private func pollIngestJob(jobId: String) async {
        while !Task.isCancelled {
            do {
                let status = try await client.ingestJobStatus(jobId: jobId)
                switch status.status {
                case "completed":
                    ingestStatus = .indexed(chunks: status.result?.chunks ?? 0)
                    return
                case "failed":
                    ingestStatus = .failed(status.error ?? "索引失败")
                    return
                default:
                    ingestStatus = .indexing(percent: status.percent, message: status.message)
                }
            } catch {
                ingestStatus = .failed(error.localizedDescription)
                return
            }
            try? await Task.sleep(for: .seconds(1))
        }
    }

    private func refreshIngestStatus(filename: String) async {
        do {
            let list = try await client.listDocuments()
            if let doc = list.documents.first(where: { $0.filename == filename }) {
                ingestStatus = .indexed(chunks: doc.chunks)
            }
        } catch {
            // Service offline — health polling surfaces that separately.
        }
    }
}
