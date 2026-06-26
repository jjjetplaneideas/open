//! Shared editor engine.
//!
//! A small, portable text-buffer core intended to be compiled to a native
//! library and shared across platforms (iOS via Swift FFI, Android via JNI,
//! and the React Native layer via a native module / WASM). It deliberately has
//! zero platform dependencies so the same editing semantics run everywhere.
//!
//! This is a clean-room implementation: it is inspired by the general design of
//! modern code editors but copies no third-party source. See `docs/LICENSING.md`.

/// A simple line-indexed text buffer with offset-based editing.
///
/// The buffer stores text as a `String`. For a production editor this would be
/// backed by a rope; the public API here is intentionally rope-compatible so
/// the internals can be swapped without breaking callers.
#[derive(Debug, Clone, Default)]
pub struct TextBuffer {
    text: String,
}

impl TextBuffer {
    /// Creates a buffer seeded with `initial` contents.
    pub fn new(initial: &str) -> Self {
        Self {
            text: initial.to_string(),
        }
    }

    /// Returns the full buffer contents.
    pub fn contents(&self) -> &str {
        &self.text
    }

    /// Returns the number of lines (always at least 1).
    pub fn line_count(&self) -> usize {
        self.text.bytes().filter(|&b| b == b'\n').count() + 1
    }

    /// Returns the text of `line` (0-based), without the trailing newline.
    pub fn line(&self, line: usize) -> Option<&str> {
        self.text.split('\n').nth(line)
    }

    /// Inserts `s` at byte `offset`. Offsets past the end clamp to the end.
    pub fn insert(&mut self, offset: usize, s: &str) {
        let at = offset.min(self.text.len());
        self.text.insert_str(at, s);
    }

    /// Deletes the bytes in `[start, end)` (clamped to valid bounds).
    pub fn delete(&mut self, start: usize, end: usize) {
        let len = self.text.len();
        let (start, end) = (start.min(len), end.min(len));
        if start < end {
            self.text.replace_range(start..end, "");
        }
    }

    /// Total length in bytes.
    pub fn len(&self) -> usize {
        self.text.len()
    }

    /// Whether the buffer is empty.
    pub fn is_empty(&self) -> bool {
        self.text.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_lines() {
        let buf = TextBuffer::new("a\nb\nc");
        assert_eq!(buf.line_count(), 3);
        assert_eq!(buf.line(1), Some("b"));
    }

    #[test]
    fn inserts_and_deletes() {
        let mut buf = TextBuffer::new("hello world");
        buf.insert(5, ",");
        assert_eq!(buf.contents(), "hello, world");
        buf.delete(0, 7);
        assert_eq!(buf.contents(), "world");
    }

    #[test]
    fn clamps_out_of_bounds() {
        let mut buf = TextBuffer::new("hi");
        buf.insert(999, "!");
        assert_eq!(buf.contents(), "hi!");
        buf.delete(1, 999);
        assert_eq!(buf.contents(), "h");
    }
}
