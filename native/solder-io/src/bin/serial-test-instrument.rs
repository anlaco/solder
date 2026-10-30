//! The serial test instrument for Node's tests (DT-070 §9): it opens a pseudo-terminal, prints its VISA
//! resource on one line, and answers on it until its standard input closes, so it ends with the test that
//! started it.

#[cfg(unix)]
#[path = "../../tests/pseudo_terminal/mod.rs"]
mod pseudo_terminal;

#[cfg(unix)]
fn main() {
    use std::io::Read;
    let instrument = pseudo_terminal::start_instrument();
    println!("{}", instrument.resource);
    let _ = std::io::stdin().read_to_end(&mut Vec::new());
}

#[cfg(not(unix))]
fn main() {
    eprintln!("The serial test instrument needs a pseudo-terminal, which this system does not have.");
    std::process::exit(1);
}
