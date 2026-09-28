//
//  TestEnvironment.swift
//  PageFlow
//
//  Detects the app-hosted test environment.
//

import Foundation

enum TestEnvironment {
    /// The Test action marks the host before the test bundle is injected;
    /// checking XCTestCase alone can miss Swift Testing during startup.
    /// Used to suppress UI that blocks the main actor under tests: the
    /// auto-open file panel (its modal behavior starves @MainActor tests and
    /// cascades the suite) and the quit-time save prompt (which turns finished
    /// test hosts into zombie processes).
    static let isRunningTests = ProcessInfo.processInfo.environment["VIBEREADER_TEST_HOST"] == "1"
        || NSClassFromString("XCTestCase") != nil
}
