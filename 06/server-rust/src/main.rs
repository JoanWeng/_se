use server_rust::{build_router, AppState};
use tower_http::cors::CorsLayer;

#[tokio::main]
async fn main() {
    let app = build_router(AppState::default()).layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8000")
        .await
        .expect("無法綁定 0.0.0.0:8000");

    println!("Rust backend listening on http://localhost:8000");
    axum::serve(listener, app).await.unwrap();
}
