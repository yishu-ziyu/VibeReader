//
//  CitationLocatorTests.swift
//  PageFlowTests
//

import Foundation
import Testing
@testable import PageFlow

/// Behavior at the seam "where on this page is the cited passage?".
/// Every assertion reads back the page text the returned range covers, so the
/// tests stay independent of how the locator matches internally.
struct CitationLocatorTests {
    private func located(_ quote: String, in page: String) -> String? {
        CitationLocator.locate(quote, in: page).map { (page as NSString).substring(with: $0) }
    }

    @Test func findsAQuoteThatAppearsVerbatim() {
        let page = "Down the rabbit hole. The King and Queen of Hearts were seated on their throne. The end."
        let quote = "The King and Queen of Hearts were seated on their throne."

        #expect(located(quote, in: page) == quote)
    }

    @Test func findsAQuoteAcrossPDFLineBreaksAndHyphenation() {
        let page = "Intro.\nAlice was begin-\nning to get very tired of sit-\nting by her sister on the bank.\nNext."
        let quote = "Alice was beginning to get very tired of sitting by her sister on the bank."

        let match = located(quote, in: page)
        #expect(match?.hasPrefix("Alice") == true)
        #expect(match?.hasSuffix("bank.") == true)
    }

    @Test func findsAChineseQuoteWhenThePDFInsertsSpaces() {
        let page = "第一章\n监督 学习使用\n标注数据训练 模型。无监督学习不需要标注。"
        let quote = "监督学习使用标注数据训练模型。"

        let match = located(quote, in: page)
        #expect(match?.hasPrefix("监督") == true)
        #expect(match?.hasSuffix("模型。") == true)
    }

    @Test func findsANearMatchWhenAFewCharactersDiffer() {
        let page = """
        Alice noticed, with some surprise, that the pebbles were all turning into little \
        cakes as they lay on the floor and a bright idea came into her head. "If I eat one \
        of these cakes," she thought, "it's sure to make some change in my size."
        """
        // Parser output keeps markdown emphasis and differs in a couple of spots.
        let quote = """
        Alice noticed, with some surprise, that the pebbles were all turnin into little \
        cakes as they lay on the floor and a bright idea came into her head. "If I eat one \
        of these cakes," she thought, "it's sure to make _some_ change in my size."
        """

        let match = located(quote, in: page)
        #expect(match?.contains("pebbles were all turning") == true)
        #expect(match?.contains("bright idea came into her head") == true)
    }

    @Test func highlightsOnlyThePartOfAQuoteThatIsOnThisPage() {
        let page = """
        Chapter footer text that is not cited. The King and Queen of Hearts were seated on \
        their throne when they arrived, with a great crowd assembled about them
        """
        let quote = """
        The King and Queen of Hearts were seated on their throne when they arrived, with a \
        great crowd assembled about them--all sorts of little birds and beasts, as well as the \
        whole pack of cards: the Knave was standing before them, in chains.
        """

        let match = located(quote, in: page)
        #expect(match?.hasPrefix("The King") == true)
        #expect(match?.hasSuffix("about them") == true)
    }

    @Test func returnsNothingForAQuoteThatIsNotOnThePage() {
        let page = "The Mouse looked at Alice rather inquisitively and seemed to wink with one of its eyes."
        let quote = "Supervised learning trains a model on labelled examples before deployment."

        #expect(CitationLocator.locate(quote, in: page) == nil)
    }

    @Test func returnsNothingForAnEmptyQuote() {
        #expect(CitationLocator.locate("  \n ", in: "Some page text.") == nil)
    }
}
