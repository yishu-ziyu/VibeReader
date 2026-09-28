//
//  UniRAGServiceLauncher.swift
//  VibeReader
//
//  Launches the local UniRAG service on app start and stops it on quit.
//

import Foundation
import AppKit

/// Starts the UniRAG knowledge service and tears it down on quit.
///
/// Primary path: the bundled sidecar (`Resources/uni-rag/runtime/bin/python3`,
/// built by `scripts/build-unirag-sidecar.sh`) — no `uv` and no folder picker
/// required, so a downloaded .app works out of the box.
/// Fallback path (development): `uv run uni-rag serve` against a project
/// directory the user picked once.
///
/// The chat panel's health poll picks the service up automatically once it's
/// listening; a failed launch surfaces an alert instead of dying silently.
@MainActor
final class UniRAGServiceLauncher {
    static let shared = UniRAGServiceLauncher()

    private static let port = 8766

    /// True while a spawned process is still booting. The model load on first
    /// run can take minutes (weights download), so "not online yet" is not
    /// distinguishable from "crashed" from here — the health poll resolves it.
    private(set) var isLaunching = false

    private var process: Process?
    private var stopping = false
    private var launchAttempt = 0
    private var alertShown = false

    // MARK: - Lifecycle

    func startIfNeeded() {
        Task {
            if await UniRAGClient().health() {
                alertShown = false
                return
            }
            launch()
        }
    }

    func stop() {
        guard let process else { return }
        stopping = true
        self.process = nil
        // terminate() is SIGTERM; uvicorn usually honors it, but a wedged model
        // load can linger and hold port 8766, so force-kill after a grace period.
        let pid = process.processIdentifier
        DispatchQueue.global().async {
            usleep(3_000_000)
            if kill(pid, 0) == 0 { kill(pid, SIGKILL) }
        }
        process.terminate()
    }

    /// Restarts the service so a newly saved API key takes effect.
    func restart() {
        stop()
        alertShown = false
        launchAttempt = 0
        launch(after: 1)
    }

    // MARK: - Launch

    private func launch() {
        guard process == nil, !isLaunching else { return }
        isLaunching = true
        launchAttempt += 1

        guard let config = launchConfig() else {
            isLaunching = false
            presentMissingServiceAlert()
            return
        }

        let process = Process()
        process.executableURL = config.executable
        process.arguments = config.arguments
        process.currentDirectoryURL = config.cwd
        process.environment = environment(bundled: config.bundled)

        // Keep a log so a failing service isn't invisible.
        let logURL = logFileURL()
        FileManager.default.createFile(atPath: logURL.path, contents: nil)
        if let handle = try? FileHandle(forWritingTo: logURL) {
            handle.seekToEndOfFile()
            process.standardOutput = handle
            process.standardError = handle
        }

        process.terminationHandler = { [weak self] finished in
            Task { @MainActor in
                guard let self, self.process?.processIdentifier == finished.processIdentifier else { return }
                self.process = nil
                self.isLaunching = false
                if self.stopping {
                    self.stopping = false
                    return
                }
                // One automatic retry covers a port still held by the previous
                // instance; after that the alert asks the user to act.
                if self.launchAttempt <= 2 {
                    self.launch(after: 2)
                } else {
                    self.presentMissingServiceAlert()
                }
            }
        }

        do {
            try process.run()
            self.process = process
        } catch {
            isLaunching = false
            NSLog("UniRAG launch failed: \(error.localizedDescription)")
            presentMissingServiceAlert()
        }
    }

    private func launch(after seconds: TimeInterval) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            self?.launch()
        }
    }

    private struct LaunchConfig {
        let executable: URL
        let arguments: [String]
        let cwd: URL
        let bundled: Bool
    }

    /// Bundled sidecar first; `uv` + picked/bundled project dir as dev fallback.
    private func launchConfig() -> LaunchConfig? {
        if let resourceURL = Bundle.main.resourceURL {
            let project = resourceURL.appending(path: "uni-rag")
            let python = project.appending(path: "runtime/bin/python3")
            if FileManager.default.isExecutableFile(atPath: python.path) {
                return LaunchConfig(
                    executable: python,
                    arguments: ["-m", "uni_rag.server", "--port", "\(Self.port)"],
                    cwd: project,
                    bundled: true
                )
            }
        }
        guard let uvURL = findUV(), let projectURL = findProjectDir() else { return nil }
        return LaunchConfig(
            executable: uvURL,
            arguments: ["run", "uni-rag", "serve", "--port", "\(Self.port)"],
            cwd: projectURL,
            bundled: false
        )
    }

    private func environment(bundled: Bool) -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        // Never let an ambient virtualenv leak into the service.
        env["VIRTUAL_ENV"] = nil

        // UniRAG requires a key at startup (pydantic-settings); the user's key
        // lives in the Keychain, injected here instead of any .env file.
        if let apiKey = UniRAGKeychain.get(UniRAGKeychain.llmAccount) {
            env["UNI_RAG_LLM_API_KEY"] = apiKey
        }

        let support = appSupportDir()
        if bundled {
            // Models (~6G) are deliberately not in the .app; sentence-transformers
            // downloads them into this app-owned cache on first use. A dev project
            // keeps its existing ~/.cache/huggingface instead of re-downloading.
            let models = support.appending(path: "unirag-models")
            try? FileManager.default.createDirectory(at: models, withIntermediateDirectories: true)
            env["HF_HOME"] = models.path
            // The bundled runtime keeps its knowledge base in Application Support
            // so it survives app updates; an explicit dev project keeps ./data,
            // which is where its historical index lives.
            env["UNI_RAG_DATA_DIR_PATH"] = support.appending(path: "unirag-data").path
        }
        return env
    }

    private func appSupportDir() -> URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "VibeReader")
    }

    /// GUI apps don't inherit the shell PATH, so probe the usual install spots.
    private func findUV() -> URL? {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let candidates = [
            home.appending(path: ".local/bin/uv"),
            URL(fileURLWithPath: "/opt/homebrew/bin/uv"),
            URL(fileURLWithPath: "/usr/local/bin/uv"),
        ]
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0.path) }
    }

    /// Locates a UniRAG project directory for the `uv` dev fallback:
    /// 1. a path the user previously chose (persisted in UserDefaults),
    /// 2. a bundled copy inside the app,
    /// 3. a one-time folder picker — the choice is remembered.
    private func findProjectDir() -> URL? {
        if let path = UserDefaults.standard.string(forKey: "uniragProjectPath") {
            let url = URL(fileURLWithPath: path)
            if isValidProject(url) { return url }
        }
        if let resourceURL = Bundle.main.resourceURL {
            let bundled = resourceURL.appending(path: "uni-rag")
            if isValidProject(bundled) { return bundled }
        }
        return askUserForProjectDir()
    }

    private func isValidProject(_ url: URL) -> Bool {
        FileManager.default.fileExists(atPath: url.appending(path: "pyproject.toml").path)
    }

    private func askUserForProjectDir() -> URL? {
        guard !TestEnvironment.isRunningTests else { return nil }
        let panel = NSOpenPanel()
        panel.message = "选择 UniRAG 服务所在的文件夹（包含 pyproject.toml）"
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = false
        guard panel.runModal() == .OK,
              let url = panel.url,
              isValidProject(url) else { return nil }
        UserDefaults.standard.set(url.path, forKey: "uniragProjectPath")
        return url
    }

    /// A silent failure here kills the whole Q&A feature with no explanation,
    /// so surface it once per failure cycle.
    private func presentMissingServiceAlert() {
        guard !TestEnvironment.isRunningTests, !alertShown else { return }
        alertShown = true
        let alert = NSAlert()
        alert.messageText = "知识库服务无法启动"
        alert.informativeText = """
        引用式问答与文档索引依赖本地知识库服务。

        · 如果你使用的是正式安装包：内置服务缺失，请重新下载并安装 VibeReader。
        · 如果这是开发环境：请确认已安装 uv，并在「设置 → 知识库」中重新指定 UniRAG 项目目录。

        服务日志：\(logFileURL().path)
        """
        alert.addButton(withTitle: "好")
        NSApp.activate(ignoringOtherApps: true)
        alert.runModal()
    }

    private func logFileURL() -> URL {
        let dir = appSupportDir()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appending(path: "unirag.log")
    }
}
