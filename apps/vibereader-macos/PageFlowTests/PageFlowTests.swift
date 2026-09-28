//
//  PageFlowTests.swift
//  PageFlowTests
//
//  Created by Chong Pin Shin on 7/12/25.
//

import Testing
@testable import PageFlow

struct PageFlowTests {

    @Test func appHostStartsInTestMode() {
        // Startup must suppress modal first-launch and service setup UI before tests run.
        #expect(TestEnvironment.isRunningTests)
    }

}
