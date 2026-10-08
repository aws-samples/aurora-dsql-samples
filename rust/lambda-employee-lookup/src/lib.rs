//! Shared library for the DSQL Employee Lookup Lambda.
//!
//! Contains models, request parsing, search pattern building,
//! cursor encoding, and response formatting — extracted from
//! main.rs for testability.

pub mod cursor;
pub mod models;
pub mod parsing;
pub mod response;

pub use cursor::*;
pub use models::*;
pub use parsing::*;
pub use response::*;
