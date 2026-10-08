use serde::{Deserialize, Serialize};

#[derive(Deserialize, Debug, Clone)]
pub struct LookupRequest {
    #[serde(default)]
    pub name: Option<String>,
    /// Base64-encoded cursor for keyset pagination (from previous response's `next`)
    #[serde(default)]
    pub after: Option<String>,
    /// Max rows to return (default 50, max 50)
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Serialize, Debug, Clone)]
pub struct Employee {
    pub id: String,
    pub name: String,
    pub email: String,
    pub department: String,
    pub title: String,
    pub hire_date: String,
}
