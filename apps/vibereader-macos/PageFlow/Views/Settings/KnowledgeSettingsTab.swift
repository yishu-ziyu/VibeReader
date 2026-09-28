//
//  KnowledgeSettingsTab.swift
//  VibeReader
//
//  Settings tab for the knowledge base: LLM API key (Keychain) and service.
//

import SwiftUI

struct KnowledgeSettingsTab: View {
    @State private var apiKey = ""
    @State private var saved = false
    @State private var serviceOnline = false
    @State private var documents: [UniRAGDocumentInfo] = []
    @State private var documentToDelete: UniRAGDocumentInfo?

    var body: some View {
        Form {
            Section {
                SecureField("LLM API Key（如 MiniMax）", text: $apiKey)
                    .textFieldStyle(.roundedBorder)

                HStack {
                    Button("保存") { save() }
                    if saved {
                        Text("已保存到钥匙串")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Text("密钥只存于 macOS 钥匙串，启动知识库服务时注入，不写入任何文件。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } header: {
                Text("模型密钥")
            }

            Section {
                HStack {
                    Circle()
                        .fill(serviceOnline ? Color.green : Color.gray)
                        .frame(width: 8, height: 8)
                    Text(serviceOnline ? "知识库服务运行中" : "知识库服务未运行")
                    Spacer()
                    Button("重新检查") { checkHealth() }
                    Button("重启服务") {
                        UniRAGServiceLauncher.shared.restart()
                        // Give the service a moment to come up before re-checking.
                        Task {
                            try? await Task.sleep(for: .seconds(5))
                            checkHealth()
                        }
                    }
                }
            } header: {
                Text("知识库服务")
            } footer: {
                Text("应用启动时会自动拉起服务；保存新密钥后可在这里立即重启服务。首次使用需联网下载模型（约 6G），期间问答面板会显示服务未就绪。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section {
                if documents.isEmpty {
                    Text(serviceOnline ? "知识库为空" : "服务未运行，无法读取文档列表")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(documents) { doc in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(doc.filename)
                                Text("\(doc.chunks) 个片段")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button("移除", role: .destructive) {
                                documentToDelete = doc
                            }
                        }
                    }
                }
            } header: {
                HStack {
                    Text("已索引的文档")
                    Spacer()
                    Button("刷新") { loadDocuments() }
                        .font(.body)
                }
            } footer: {
                Text("打开过的 PDF 会自动索引。移除会删除其向量、关键词索引与上传副本，之后重新打开该文件会再次索引。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .padding()
        .onAppear {
            apiKey = UniRAGKeychain.get(UniRAGKeychain.llmAccount) ?? ""
            checkHealth()
            loadDocuments()
        }
        .confirmationDialog(
            "从知识库移除「\(documentToDelete?.filename ?? "")」？",
            isPresented: Binding(
                get: { documentToDelete != nil },
                set: { if !$0 { documentToDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("移除", role: .destructive) {
                if let doc = documentToDelete {
                    delete(doc)
                }
                documentToDelete = nil
            }
            Button("取消", role: .cancel) { documentToDelete = nil }
        }
    }

    private func save() {
        UniRAGKeychain.set(UniRAGKeychain.llmAccount, value: apiKey)
        saved = true
        Task {
            try? await Task.sleep(for: .seconds(2))
            saved = false
        }
    }

    private func checkHealth() {
        Task {
            serviceOnline = await UniRAGClient().health()
        }
    }

    private func loadDocuments() {
        Task {
            do {
                documents = try await UniRAGClient().listDocuments().documents
            } catch {
                documents = []
            }
        }
    }

    private func delete(_ doc: UniRAGDocumentInfo) {
        guard let sourceId = doc.sourceId else { return }
        Task {
            do {
                try await UniRAGClient().deleteDocument(sourceId: sourceId)
            } catch {
                NSLog("UniRAG delete failed: \(error.localizedDescription)")
            }
            loadDocuments()
        }
    }
}
