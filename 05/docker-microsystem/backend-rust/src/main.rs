use axum::{routing::get, Json, Router};
use serde_json::{json, Value};
use std::net::SocketAddr;

async fn db_check() -> Result<(), String> {
    let url = std::env::var("DATABASE_URL").unwrap_or_default();
    let (client, connection) = tokio_postgres::connect(url.as_str(), tokio_postgres::NoTls)
        .await
        .map_err(|e| e.to_string())?;
    tokio::spawn(async move {
        let _ = connection.await;
    });
    client
        .query_one("SELECT 1 AS one", &[])
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn index() -> Json<Value> {
    Json(json!({"service": "api-rust", "runtime": "Rust + Axum", "message": "Hello from Rust!"}))
}

async fn health() -> Json<Value> {
    match db_check().await {
        Ok(()) => Json(json!({"service": "api-rust", "status": "ok", "db": "connected"})),
        Err(e) => Json(json!({"service": "api-rust", "status": "error", "db": e})),
    }
}

async fn users() -> Json<Value> {
    let url = std::env::var("DATABASE_URL").unwrap_or_default();
    let result: Result<Value, String> = async {
        let (client, connection) =
            tokio_postgres::connect(url.as_str(), tokio_postgres::NoTls).await.map_err(|e| e.to_string())?;
        tokio::spawn(async move {
            let _ = connection.await;
        });
        client
            .execute("INSERT INTO visits (service) VALUES ('api-rust')", &[])
            .await
            .map_err(|e| e.to_string())?;
        let rows = client
            .query("SELECT id, service FROM visits ORDER BY id DESC LIMIT 5", &[])
            .await
            .map_err(|e| e.to_string())?;
        let visits: Vec<Value> = rows
            .iter()
            .map(|r| json!({"id": r.get::<_, i32>(0), "service": r.get::<_, String>(1)}))
            .collect();
        Ok(json!({"service": "api-rust", "count": visits.len(), "visits": visits}))
    }
    .await;
    match result {
        Ok(v) => Json(v),
        Err(e) => Json(json!({"error": e})),
    }
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/", get(index))
        .route("/health", get(health))
        .route("/api/users", get(users));
    let port: u16 = std::env::var("PORT").unwrap_or("8000".into()).parse().unwrap_or(8000);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("api-rust listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
