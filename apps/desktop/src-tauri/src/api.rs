use crate::models::{
    CreateDatabaseRequest, CreateWebsiteRequest, ProtectedNameRequest, ProtectedWebsiteRequest,
};
use crate::{services, stack, system};
use axum::{
    extract::Json,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};

#[derive(Serialize, Deserialize)]
pub struct ControlServiceBody {
    pub key: String,
    pub action: String,
}

#[derive(Serialize, Deserialize)]
pub struct CloneWebsiteBody {
    pub source: String,
    pub target: String,
}

#[derive(Serialize, Deserialize)]
pub struct CreateBackupBody {
    pub kind: String,
    pub name: String,
}

fn check_auth(headers: &HeaderMap) -> Result<(), (StatusCode, String)> {
    let settings = stack::settings().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to load settings: {e}"),
        )
    })?;

    if !settings.enable_rest_bridge {
        return Err((
            StatusCode::FORBIDDEN,
            "REST bridge is disabled in settings".to_string(),
        ));
    }

    let Some(stored_hash) = settings.admin_password_hash else {
        return Err((
            StatusCode::FORBIDDEN,
            "Admin password is not configured".to_string(),
        ));
    };

    let auth_header = headers
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .ok_or((StatusCode::UNAUTHORIZED, "Missing Authorization header".to_string()))?;

    if !auth_header.starts_with("Bearer ") {
        return Err((
            StatusCode::UNAUTHORIZED,
            "Invalid Authorization format. Expected Bearer <token>".to_string(),
        ));
    }

    let token = &auth_header[7..];
    if token != stored_hash {
        return Err((StatusCode::UNAUTHORIZED, "Invalid API token".to_string()));
    }

    Ok(())
}

async fn handle_authorized<F, Fut, T>(headers: HeaderMap, f: F) -> impl IntoResponse
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Result<T, String>>,
    T: Serialize,
{
    if let Err((status, err)) = check_auth(&headers) {
        return (status, Json(serde_json::json!({ "error": err }))).into_response();
    }

    match f().await {
        Ok(data) => (StatusCode::OK, Json(data)).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err })),
        )
            .into_response(),
    }
}

async fn get_overview(headers: HeaderMap) -> impl IntoResponse {
    handle_authorized(headers, || async {
        Ok(system::overview().await)
    })
    .await
}

async fn get_services(headers: HeaderMap) -> impl IntoResponse {
    handle_authorized(headers, || async {
        Ok(services::refresh_services().await)
    })
    .await
}

async fn control_service(
    headers: HeaderMap,
    Json(body): Json<ControlServiceBody>,
) -> impl IntoResponse {
    handle_authorized(headers, move || async move {
        services::control_service(&body.key, &body.action)
            .await
            .map_err(|e| e.to_string())
    })
    .await
}

async fn get_websites(headers: HeaderMap) -> impl IntoResponse {
    handle_authorized(headers, || async {
        stack::websites().map_err(|e| e.to_string())
    })
    .await
}

async fn create_website(
    headers: HeaderMap,
    Json(body): Json<CreateWebsiteRequest>,
) -> impl IntoResponse {
    handle_authorized(headers, move || async move {
        stack::create_website(&body.domain, body.php_version, body.ssl).map_err(|e| e.to_string())
    })
    .await
}

async fn delete_website(
    headers: HeaderMap,
    Json(body): Json<ProtectedWebsiteRequest>,
) -> impl IntoResponse {
    handle_authorized(headers, move || async move {
        stack::delete_website_protected(&body.domain, &body.admin_password).map_err(|e| e.to_string())
    })
    .await
}

async fn clone_website(
    headers: HeaderMap,
    Json(body): Json<CloneWebsiteBody>,
) -> impl IntoResponse {
    handle_authorized(headers, move || async move {
        stack::clone_website(&body.source, &body.target).map_err(|e| e.to_string())
    })
    .await
}

async fn get_databases(headers: HeaderMap) -> impl IntoResponse {
    handle_authorized(headers, || async {
        stack::list_databases().await.map_err(|e| e.to_string())
    })
    .await
}

async fn create_database(
    headers: HeaderMap,
    Json(body): Json<CreateDatabaseRequest>,
) -> impl IntoResponse {
    handle_authorized(headers, move || async move {
        stack::create_database_with_user(&body.name, &body.username, &body.password)
            .await
            .map_err(|e| e.to_string())
    })
    .await
}

async fn delete_database(
    headers: HeaderMap,
    Json(body): Json<ProtectedNameRequest>,
) -> impl IntoResponse {
    handle_authorized(headers, move || async move {
        stack::delete_database_protected(&body.name, &body.admin_password)
            .await
            .map_err(|e| e.to_string())
    })
    .await
}

async fn get_backups(headers: HeaderMap) -> impl IntoResponse {
    handle_authorized(headers, || async {
        stack::backups().map_err(|e| e.to_string())
    })
    .await
}

async fn create_backup(
    headers: HeaderMap,
    Json(body): Json<CreateBackupBody>,
) -> impl IntoResponse {
    handle_authorized(headers, move || async move {
        stack::create_backup(&body.kind, &body.name).map_err(|e| e.to_string())
    })
    .await
}

pub async fn run_server() {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/overview", get(get_overview))
        .route("/api/services", get(get_services))
        .route("/api/services/control", post(control_service))
        .route("/api/websites", get(get_websites))
        .route("/api/websites/create", post(create_website))
        .route("/api/websites/delete", post(delete_website))
        .route("/api/websites/clone", post(clone_website))
        .route("/api/databases", get(get_databases))
        .route("/api/databases/create", post(create_database))
        .route("/api/databases/delete", post(delete_database))
        .route("/api/backups", get(get_backups))
        .route("/api/backups/create", post(create_backup))
        .layer(cors);

    let addr = SocketAddr::from(([127, 0, 0, 1], 4820));
    
    if let Ok(listener) = tokio::net::TcpListener::bind(addr).await {
        let _ = axum::serve(listener, app).await;
    }
}
