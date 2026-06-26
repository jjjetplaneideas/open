//! Tiny demo exercising the shared editor engine from the command line.

use editor_engine::TextBuffer;

fn main() {
    let mut buf = TextBuffer::new("fn main() {}\n");
    buf.insert(11, "\n    // edited by the shared engine");
    println!("lines: {}", buf.line_count());
    println!("{}", buf.contents());
}
