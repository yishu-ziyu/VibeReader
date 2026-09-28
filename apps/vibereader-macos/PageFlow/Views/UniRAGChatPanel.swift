//
//  UniRAGChatPanel.swift
//  VibeReader
//
//  Right-side Q&A panel: chat with the local knowledge base, with citations
//  that jump back into the PDF.
//

import SwiftUI
import AppKit

struct UniRAGChatPanel: View {
    @Bindable var chatManager: UniRAGChatManager
    var pdfManager: PDFManager
    let onClose: () -> Void

    @State private var questionInput = ""
    @State private var memoryFeedback: String?
    @State private var citationNotice: String?
    @FocusState private var inputFocused: Bool

    private var selectedText: String? {
        pdfManager.selectedText
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            serviceBanner
            documentStatusBanner
            messagesList
            inputBar
        }
        .frame(width: 340)
        .pageFlowLiquidGlassPanel(.sidebar)
        .onAppear {
            chatManager.startHealthPolling()
        }
        .onDisappear {
            chatManager.stopHealthPolling()
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text("知识问答")
                .font(.headline)
                .pageFlowGlassControlLabel()
            Spacer()
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(DesignTokens.sidebarSecondaryText)
                    .frame(width: DesignTokens.tabCloseButtonSize, height: DesignTokens.tabCloseButtonSize)
                    .pageFlowGlassControlLabel()
            }
            .buttonStyle(.plain)
            .contentShape(Rectangle())
        }
        .padding(.leading, DesignTokens.spacingMD)
        .padding(.trailing, DesignTokens.spacingSM)
        .padding(.top, DesignTokens.spacingSM)
    }

    // MARK: - Banners

    @ViewBuilder
    private var serviceBanner: some View {
        if chatManager.serviceOnline == false {
            banner(
                icon: "hourglass",
                text: "正在启动知识库服务",
                detail: "首次使用需联网下载模型，可能需要几分钟"
            )
        }
    }

    @ViewBuilder
    private var documentStatusBanner: some View {
        switch chatManager.ingestStatus {
        case .unknown:
            EmptyView()
        case .indexed(let chunks):
            banner(icon: "checkmark.circle", text: "本文档已建立索引", detail: "\(chunks) 个片段")
        case .indexing(let percent, let message):
            banner(icon: "arrow.triangle.2.circlepath", text: message, detail: "\(percent)%")
        case .failed(let message):
            banner(icon: "exclamationmark.triangle", text: "索引失败", detail: message)
        }
    }

    private func banner(icon: String, text: String, detail: String?) -> some View {
        HStack(spacing: DesignTokens.spacingSM) {
            Image(systemName: icon)
                .font(.system(size: 11))
                .foregroundStyle(DesignTokens.sidebarSecondaryText)
            VStack(alignment: .leading, spacing: 1) {
                Text(text)
                    .font(.caption)
                    .foregroundStyle(DesignTokens.sidebarPrimaryText)
                if let detail {
                    Text(detail)
                        .font(.caption2)
                        .foregroundStyle(DesignTokens.sidebarTertiaryText)
                        .lineLimit(2)
                }
            }
            Spacer()
            if case .failed = chatManager.ingestStatus, icon == "exclamationmark.triangle" {
                Button("重试") {
                    chatManager.ingestCurrentDocument(fileURL: pdfManager.documentURL)
                }
                .font(.caption2)
                .buttonStyle(.plain)
                .foregroundStyle(DesignTokens.sidebarSecondaryText)
            } else if case .unknown = chatManager.ingestStatus {
                EmptyView()
            }
        }
        .padding(.horizontal, DesignTokens.spacingSM)
        .padding(.vertical, DesignTokens.spacingXS)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.white.opacity(0.5))
        )
        .padding(.horizontal, DesignTokens.spacingSM)
        .padding(.top, DesignTokens.spacingXS)
    }

    // MARK: - Messages

    private var messagesList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: DesignTokens.spacingSM) {
                    if chatManager.messages.isEmpty {
                        emptyState
                    } else {
                        ForEach(Array(chatManager.messages.enumerated()), id: \.element.id) { index, message in
                            MessageBubble(
                                message: message,
                                onCitationTap: { citation in
                                    jumpToCitation(citation)
                                },
                                onSaveAsMemory: message.role == .assistant ? {
                                    saveAnswer(message, at: index)
                                } : nil
                            )
                            .id(message.id)
                        }
                    }
                }
                .padding(.horizontal, DesignTokens.spacingSM)
                .padding(.vertical, DesignTokens.spacingSM)
            }
            .onChange(of: chatManager.messages.count) { _, _ in
                if let last = chatManager.messages.last {
                    withAnimation {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: DesignTokens.spacingSM) {
            Image(systemName: "sparkles")
                .font(.system(size: 24))
                .foregroundStyle(DesignTokens.sidebarTertiaryText)
            Text("向知识库提问")
                .font(.caption)
                .foregroundStyle(DesignTokens.sidebarSecondaryText)
            Text("回答会附带原文出处，点击引用可跳转到对应页面")
                .font(.caption2)
                .foregroundStyle(DesignTokens.sidebarTertiaryText)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, DesignTokens.spacingXL)
    }

    // MARK: - Input

    private var inputBar: some View {
        VStack(spacing: DesignTokens.spacingXS) {
            if let memoryFeedback {
                Text(memoryFeedback)
                    .font(.caption2)
                    .foregroundStyle(DesignTokens.sidebarSecondaryText)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let citationNotice {
                Text(citationNotice)
                    .font(.caption2)
                    .foregroundStyle(DesignTokens.sidebarSecondaryText)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let selectedText, !selectedText.isEmpty {
                HStack(spacing: DesignTokens.spacingXS) {
                    Image(systemName: "text.quote")
                        .font(.system(size: 9))
                        .foregroundStyle(DesignTokens.sidebarTertiaryText)
                    Text(selectedText)
                        .font(.caption2)
                        .foregroundStyle(DesignTokens.sidebarSecondaryText)
                        .lineLimit(2)
                    Spacer()
                    Button("存为记忆") {
                        saveSelection(selectedText)
                    }
                    .font(.caption2)
                    .buttonStyle(.plain)
                    .foregroundStyle(Color(nsColor: .controlAccentColor))
                }
                .padding(.horizontal, DesignTokens.spacingSM)
                .padding(.vertical, DesignTokens.spacingXS)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color.white.opacity(0.4))
                )
            }

            HStack(alignment: .bottom, spacing: DesignTokens.spacingXS) {
                TextField("输入问题…", text: $questionInput, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.callout)
                    .lineLimit(1...4)
                    .focused($inputFocused)
                    .onSubmit { submit() }

                Button(action: submit) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(
                            canSubmit
                                ? Color(nsColor: .controlAccentColor)
                                : DesignTokens.sidebarTertiaryText
                        )
                }
                .buttonStyle(.plain)
                .disabled(!canSubmit)
            }
            .padding(.horizontal, DesignTokens.spacingSM)
            .padding(.vertical, DesignTokens.spacingXS)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.white.opacity(0.7))
            )
        }
        .padding(DesignTokens.spacingSM)
    }

    private var canSubmit: Bool {
        !questionInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !chatManager.isAsking
            && chatManager.serviceOnline != false
    }

    private func submit() {
        guard canSubmit else { return }
        chatManager.ask(questionInput, selectedText: selectedText)
        questionInput = ""
    }

    // MARK: - Memory

    private var documentName: String {
        pdfManager.documentURL?.lastPathComponent ?? ""
    }

    private func saveAnswer(_ message: UniRAGChatMessage, at index: Int) {
        // Find the user question immediately before this answer.
        let question = index > 0 && chatManager.messages[index - 1].role == .user
            ? chatManager.messages[index - 1].text
            : ""
        Task {
            let ok = await chatManager.saveAnswerAsMemory(
                question: question, message: message, documentName: documentName
            )
            showMemoryFeedback(ok)
        }
    }

    private func saveSelection(_ text: String) {
        let page = pdfManager.currentPageIndex + 1
        Task {
            let ok = await chatManager.saveSelectionAsMemory(
                text: text, page: page, documentName: documentName
            )
            showMemoryFeedback(ok)
        }
    }

    private func showMemoryFeedback(_ success: Bool) {
        memoryFeedback = success ? "✓ 已存入长期记忆" : "保存失败，请检查知识库服务"
        Task {
            try? await Task.sleep(for: .seconds(3))
            memoryFeedback = nil
        }
    }

    // MARK: - Citation jump

    private func jumpToCitation(_ citation: UniRAGCitation) {
        guard citation.page > 0, citation.page <= pdfManager.pageCount else { return }
        // UniRAG pages are 1-based; PDFManager indices are 0-based.
        if pdfManager.revealCitation(citation.text, onPage: citation.page - 1) {
            citationNotice = nil
        } else {
            showCitationNotice("未能在第 \(citation.page) 页定位原句，已跳到该页")
        }
    }

    private func showCitationNotice(_ text: String) {
        citationNotice = text
        Task {
            try? await Task.sleep(for: .seconds(3))
            if citationNotice == text { citationNotice = nil }
        }
    }
}

// MARK: - Message Bubble

private struct MessageBubble: View {
    let message: UniRAGChatMessage
    let onCitationTap: (UniRAGCitation) -> Void
    var onSaveAsMemory: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.spacingXS) {
            Text(message.text)
                .font(.callout)
                .foregroundStyle(
                    message.role == .error
                        ? Color.red
                        : DesignTokens.glassTextPrimary
                )
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)

            if let onSaveAsMemory {
                HStack {
                    Spacer()
                    Button(action: onSaveAsMemory) {
                        Label("存为记忆", systemImage: "brain")
                            .font(.caption2)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(DesignTokens.sidebarSecondaryText)
                }
            }

            if !message.citations.isEmpty {
                citationsView
            }
        }
        .padding(DesignTokens.spacingSM)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(message.role == .user ? Color(nsColor: .controlAccentColor).opacity(0.12) : Color.white.opacity(0.7))
        )
    }

    private var citationsView: some View {
        VStack(alignment: .leading, spacing: DesignTokens.spacingXS) {
            Text("引用来源")
                .font(.caption2)
                .foregroundStyle(DesignTokens.sidebarTertiaryText)

            ForEach(message.citations) { citation in
                Button {
                    onCitationTap(citation)
                } label: {
                    HStack(spacing: DesignTokens.spacingXS) {
                        Image(systemName: "doc.text.magnifyingglass")
                            .font(.system(size: 9))
                        VStack(alignment: .leading, spacing: 0) {
                            Text(citationLabel(citation))
                                .font(.caption2)
                                .lineLimit(1)
                            Text(citation.text)
                                .font(.caption2)
                                .foregroundStyle(DesignTokens.sidebarTertiaryText)
                                .lineLimit(2)
                        }
                        Spacer()
                        if citation.page > 0 {
                            Text("第 \(citation.page) 页")
                                .font(.caption2)
                                .foregroundStyle(DesignTokens.sidebarSecondaryText)
                        }
                    }
                }
                .buttonStyle(.plain)
                .padding(DesignTokens.spacingXS)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color.black.opacity(0.04))
                )
            }
        }
        .padding(.top, DesignTokens.spacingXS)
    }

    private func citationLabel(_ citation: UniRAGCitation) -> String {
        if citation.sourceType == "saved_memory" {
            return "我的记忆"
        }
        var label = citation.source
        if !citation.section.isEmpty {
            label += " · \(citation.section)"
        }
        return label
    }
}
