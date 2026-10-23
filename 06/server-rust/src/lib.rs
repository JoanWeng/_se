use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Message {
    pub id: u64,
    pub name: String,
    pub content: String,
    pub created_at: u64,
}

#[derive(Debug, Deserialize)]
pub struct CreateMessage {
    pub name: String,
    pub content: String,
}

#[derive(Debug, Default, Clone)]
pub struct AppState {
    inner: Arc<Mutex<InnerState>>,
}

#[derive(Debug, Default)]
struct InnerState {
    messages: Vec<Message>,
    next_id: u64,
}

impl AppState {
    pub fn create(&self, name: &str, content: &str) -> Message {
        let mut inner = self.inner.lock().unwrap();
        let message = Message {
            id: inner.next_id + 1,
            name: name.trim().to_string(),
            content: content.trim().to_string(),
            created_at: now_ms(),
        };
        inner.next_id += 1;
        inner.messages.push(message.clone());
        message
    }

    pub fn list(&self) -> Vec<Message> {
        let mut messages = self.inner.lock().unwrap().messages.clone();
        messages.sort_by(|a, b| b.id.cmp(&a.id));
        messages
    }

    pub fn remove(&self, id: u64) -> bool {
        let mut inner = self.inner.lock().unwrap();
        let before = inner.messages.len();
        inner.messages.retain(|m| m.id != id);
        inner.messages.len() != before
    }
}

pub fn validate(name: &str, content: &str) -> Result<(), Vec<String>> {
    let mut errors = Vec::new();
    let name = name.trim();
    let content = content.trim();

    if name.is_empty() {
        errors.push("暱稱不可空白".to_string());
    } else if name.chars().count() > 20 {
        errors.push("暱稱不可超過 20 字".to_string());
    }

    if content.is_empty() {
        errors.push("內容不可空白".to_string());
    } else if content.chars().count() > 200 {
        errors.push("內容不可超過 200 字".to_string());
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/messages", get(list_messages).post(create_message))
        .route("/api/messages/:id", axum::routing::delete(delete_message))
        .with_state(state)
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok", "backend": "rust" }))
}

async fn list_messages(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "messages": state.list() }))
}

async fn create_message(
    State(state): State<AppState>,
    Json(payload): Json<CreateMessage>,
) -> Result<(StatusCode, Json<Message>), (StatusCode, Json<serde_json::Value>)> {
    match validate(&payload.name, &payload.content) {
        Ok(()) => Ok((StatusCode::CREATED, Json(state.create(&payload.name, &payload.content)))),
        Err(errors) => Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": errors.join("；") })),
        )),
    }
}

async fn delete_message(State(state): State<AppState>, Path(id): Path<u64>) -> StatusCode {
    if state.remove(id) {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_accepts_normal_input() {
        assert!(validate("alice", "hello").is_ok());
    }

    #[test]
    fn validate_rejects_empty_fields() {
        let err = validate("", "").unwrap_err();
        assert_eq!(err, vec!["暱稱不可空白", "內容不可空白"]);
    }

    #[test]
    fn validate_rejects_whitespace_only() {
        assert_eq!(validate("   ", "\n\t").unwrap_err().len(), 2);
    }

    #[test]
    fn validate_rejects_too_long_fields() {
        assert_eq!(validate(&"a".repeat(21), "ok").unwrap_err(), vec!["暱稱不可超過 20 字"]);
        assert_eq!(validate("ok", &"c".repeat(201)).unwrap_err(), vec!["內容不可超過 200 字"]);
    }

    #[test]
    fn validate_allows_cjk_up_to_limit() {
        assert!(validate(&"我".repeat(20), &"字".repeat(200)).is_ok());
    }

    #[test]
    fn create_trims_and_assigns_increasing_ids() {
        let state = AppState::default();
        let m1 = state.create("  alice  ", "  hello  ");
        let m2 = state.create("bob", "hi");
        assert_eq!(m1.name, "alice");
        assert_eq!(m1.content, "hello");
        assert_eq!(m1.id, 1);
        assert_eq!(m2.id, 2);
        assert!(m1.created_at > 0);
    }

    #[test]
    fn list_sorts_newest_first() {
        let state = AppState::default();
        state.create("a", "first");
        state.create("b", "second");
        let list = state.list();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].content, "second");
        assert_eq!(list[1].content, "first");
    }

    #[test]
    fn remove_returns_true_only_for_existing_id() {
        let state = AppState::default();
        let m = state.create("a", "hello");
        assert!(state.remove(m.id));
        assert!(!state.remove(m.id));
        assert!(!state.remove(999));
        assert!(state.list().is_empty());
    }
}
