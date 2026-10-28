//! Folder sync: saved configs, scan, plan, and execute.
//! Split so the command list in lib stays a registry. Behavior matches the
//! former single lib.rs sync section.

mod execute;
mod model;
mod plan;
mod scan;

pub(crate) use execute::*;
pub(crate) use model::*;
// The running app calls the planner from `execute`. Tests import the same
// functions through `crate::sync`, so this re-export stays even though the
// library build does not name it.
#[allow(unused_imports)]
pub(crate) use plan::*;
pub(crate) use scan::*;
