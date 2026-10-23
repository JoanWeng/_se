use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::Value;
use server_rust::{build_router, AppState};
use tower::ServiceExt;

async fn send(router: Router, req: Request<Body>) -> (StatusCode, Value) {
    let response = router.oneshot(req).await.unwrap();
    let status = response.status();
    let body = response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes();
    (
        status,
        serde_json::from_slice(&body).unwrap_or(Value::Null),
    )
}

fn json_request(method: &str, uri: &str, body: Option<&str>) -> Request<Body> {
    let builder = Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json");
    match body {
        Some(text) => builder.body(Body::from(text.to_string())).unwrap(),
        None => builder.body(Body::empty()).unwrap(),
    }
}

#[tokio::test]
async fn health_reports_rust_backend() {
    let app = build_router(AppState::default());
    let (status, body) = send(app, json_request("GET", "/api/health", None)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "ok");
    assert_eq!(body["backend"], "rust");
}

#[tokio::test]
async fn create_then_list_message() {
    let app = build_router(AppState::default());

    let (status, body) = send(
        app.clone(),
        json_request(
            "POST",
            "/api/messages",
            Some(r#"{"name":"alice","content":"hello rust"}"#),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(body["name"], "alice");
    assert_eq!(body["content"], "hello rust");
    assert_eq!(body["id"], 1);

    let (status, body) = send(app, json_request("GET", "/api/messages", None)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["messages"].as_array().unwrap().len(), 1);
    assert_eq!(body["messages"][0]["content"], "hello rust");
}

#[tokio::test]
async fn create_rejects_invalid_json_field() {
    let app = build_router(AppState::default());
    let response = app
        .oneshot(json_request(
            "POST",
            "/api/messages",
            Some(r#"{"name":"alice"}"#),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn create_rejects_empty_content() {
    let app = build_router(AppState::default());
    let (status, body) = send(
        app,
        json_request(
            "POST",
            "/api/messages",
            Some(r#"{"name":"alice","content":"   "}"#),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].as_str().unwrap().contains("內容不可空白"));
}

#[tokio::test]
async fn delete_returns_204_then_404() {
    let app = build_router(AppState::default());
    send(
        app.clone(),
        json_request(
            "POST",
            "/api/messages",
            Some(r#"{"name":"alice","content":"bye"}"#),
        ),
    )
    .await;

    let (status, _) = send(app.clone(), json_request("DELETE", "/api/messages/1", None)).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (status, _) = send(app.clone(), json_request("DELETE", "/api/messages/1", None)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, _) = send(app.clone(), json_request("DELETE", "/api/messages/999", None)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}
