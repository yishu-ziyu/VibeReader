//
//  CitationLocator.swift
//  VibeReader
//
//  Finds a citation's quoted passage inside one page's extracted text.
//

import Foundation

/// Locates where a UniRAG citation's quote sits in a page's text.
///
/// Quotes come from UniRAG's own PDF parser, so they rarely match PDFKit's
/// `page.string` character for character: line breaks, end-of-line
/// hyphenation, spaces PDFKit inserts between CJK glyphs, markdown emphasis,
/// and the odd differing character. Both sides are folded to a comparable
/// form first. An exact hit on the folded text wins; otherwise fragments the
/// quote shares with the page vote on one alignment, and the page span they
/// agree on is the match. A quote that runs onto the next page therefore
/// yields just the part on this page.
///
/// Pure and PDFKit-free: the result is a UTF-16 range into `pageText`, ready
/// for `PDFPage.selection(for:)`. `nil` means the passage is not on the page.
enum CitationLocator {
    /// Fragment length (folded characters) used to vote on an alignment.
    private static let fragmentLength = 8
    /// How far a fragment may drift from the winning alignment and still count,
    /// absorbing small insertions or deletions between parser and PDFKit text.
    private static let driftTolerance = 12
    /// Share of fragments inside the matched span that must agree.
    private static let minimumAgreement = 0.5
    /// Matches shorter than this (folded characters) are treated as coincidence.
    private static let minimumMatchLength = 24

    static func locate(_ quote: String, in pageText: String) -> NSRange? {
        let quote = FoldedText(quote)
        let page = FoldedText(pageText)
        guard !quote.characters.isEmpty, !page.characters.isEmpty else { return nil }

        if let exact = page.characters.firstRange(of: quote.characters) {
            return page.sourceRange(exact.lowerBound..<exact.upperBound)
        }
        return alignedSpan(of: quote, in: page).map(page.sourceRange)
    }

    /// The page span most of the quote's fragments agree on, or nil when the
    /// agreement is too thin to be the cited passage.
    private static func alignedSpan(of quote: FoldedText, in page: FoldedText) -> Range<Int>? {
        let k = fragmentLength
        guard quote.characters.count >= k, page.characters.count >= k else { return nil }

        // Only fragments that occur once on the page can pin a position.
        var pagePositions: [ArraySlice<Character>: Int] = [:]
        var repeated = Set<ArraySlice<Character>>()
        for position in 0...(page.characters.count - k) {
            let fragment = page.characters[position..<position + k]
            if pagePositions.updateValue(position, forKey: fragment) != nil {
                repeated.insert(fragment)
            }
        }

        // Each shared fragment votes for an offset (page position − quote position).
        var hits: [(pagePosition: Int, offset: Int)] = []
        for position in 0...(quote.characters.count - k) {
            let fragment = quote.characters[position..<position + k]
            guard !repeated.contains(fragment), let pagePosition = pagePositions[fragment] else { continue }
            hits.append((pagePosition, pagePosition - position))
        }
        guard !hits.isEmpty else { return nil }

        // Winning alignment: the offset window holding the most votes.
        let offsets = hits.map(\.offset).sorted()
        var best = (low: offsets[0], count: 0)
        var start = 0
        for end in offsets.indices {
            while offsets[end] - offsets[start] > 2 * driftTolerance { start += 1 }
            if end - start + 1 > best.count { best = (offsets[start], end - start + 1) }
        }
        let band = best.low...(best.low + 2 * driftTolerance)
        let agreeing = hits.filter { band.contains($0.offset) }.map(\.pagePosition)

        guard let first = agreeing.min(), let last = agreeing.max() else { return nil }
        let span = first..<(last + k)
        let possibleFragments = span.count - k + 1
        let agreement = Double(Set(agreeing).count) / Double(possibleFragments)
        guard span.count >= min(minimumMatchLength, quote.characters.count),
              agreement >= minimumAgreement else { return nil }
        return span
    }
}

/// Text reduced to the characters worth comparing, each remembering the
/// UTF-16 range it came from in the original string.
private struct FoldedText {
    private(set) var characters: [Character] = []
    private var origins: [NSRange] = []

    init(_ text: String) {
        for index in text.indices {
            let character = text[index]
            let next = text.index(after: index)
            if Self.isIgnorable(character) { continue }
            // "begin-\nning" is one word split by the PDF layout.
            if character == "-", Self.lineBreakFollows(in: text, from: next) { continue }

            let origin = NSRange(index..<next, in: text)
            for folded in Self.fold(character) {
                characters.append(folded)
                origins.append(origin)
            }
        }
    }

    /// Maps a span of folded characters back to the original string.
    func sourceRange(_ span: Range<Int>) -> NSRange {
        let first = origins[span.lowerBound]
        let last = origins[span.upperBound - 1]
        return NSRange(location: first.location, length: NSMaxRange(last) - first.location)
    }

    private static func isIgnorable(_ character: Character) -> Bool {
        character.isWhitespace || character == "_" || character == "*" || character == "\u{00AD}"
    }

    private static func lineBreakFollows(in text: String, from index: String.Index) -> Bool {
        for character in text[index...] {
            if character.isNewline { return true }
            if !character.isWhitespace { return false }
        }
        return false
    }

    private static func fold(_ character: Character) -> [Character] {
        let normalized = String(character).precomposedStringWithCompatibilityMapping.lowercased()
        return normalized.map { folded in
            switch folded {
            case "\u{201C}", "\u{201D}", "\u{201E}", "\u{201F}": "\""
            case "\u{2018}", "\u{2019}", "\u{201A}", "\u{201B}": "'"
            default: folded
            }
        }
    }
}
