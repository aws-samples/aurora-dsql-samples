use anyhow::Result;
use dsql_employee_lookup::{connect_pool, error_response, handle_lookup, parse_request};
use lambda_http::{run, service_fn, Body, Error, Request, Response};
use sqlx::PgPool;
use std::env;
use std::sync::OnceLock;
use tracing::{error, info};

static POOL: OnceLock<PgPool> = OnceLock::new();

async fn init_pool() -> Result<PgPool> {
    let endpoint = env::var("DSQL_ENDPOINT")?;
    let user = env::var("DSQL_USER").unwrap_or_else(|_| "app_readonly".into());
    let pool = connect_pool(&endpoint, &user).await?;
    info!("DSQL connection pool initialized (max_connections=2)");
    Ok(pool)
}

async fn get_pool() -> Result<&'static PgPool> {
    if let Some(pool) = POOL.get() {
        return Ok(pool);
    }
    let pool = init_pool().await?;
    Ok(POOL.get_or_init(|| pool))
}

async fn handler(event: Request) -> Result<Response<Body>, Error> {
    let query = match parse_request(event.body()) {
        Ok(q) => q,
        Err((status, body)) => {
            return error_response(
                status,
                body["error"].as_str().unwrap_or("Invalid request body"),
                body["detail"].as_str(),
            );
        }
    };

    let pool = match get_pool().await {
        Ok(pool) => pool,
        Err(e) => {
            error!(error = %e, "Pool init failed");
            return error_response(500, "Internal server error", None);
        }
    };

    handle_lookup(query, pool).await
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    lambda_http::tracing::init_default_subscriber();
    info!("Starting dsql-employee-lookup Lambda");
    run(service_fn(handler)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};
    use dsql_employee_lookup::encode_cursor;
    use serde_json::{json, Value};
    use std::ffi::OsString;

    static CONFIG_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    struct MissingEndpoint(Option<OsString>);

    impl Drop for MissingEndpoint {
        fn drop(&mut self) {
            if let Some(endpoint) = &self.0 {
                env::set_var("DSQL_ENDPOINT", endpoint);
            }
        }
    }

    async fn call_without_database(body: Body) -> Response<Body> {
        let _lock = CONFIG_LOCK.lock().await;
        let _endpoint = MissingEndpoint(env::var_os("DSQL_ENDPOINT"));
        env::remove_var("DSQL_ENDPOINT");
        assert!(POOL.get().is_none());
        let request = Request::new(body);
        tokio::spawn(handler(request))
            .await
            .expect("handler must return a response without panicking on pool configuration")
            .expect("handler must return an HTTP response")
    }

    fn json_body(response: &Response<Body>) -> Value {
        assert_eq!(response.headers()["content-type"], "application/json");
        match response.body() {
            Body::Text(body) => serde_json::from_str(body).unwrap(),
            other => panic!("expected JSON text response, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn handler_rejects_malformed_cursors_before_pool_initialization() {
        for cursor in [
            "not-valid-base64!!!".to_string(),
            STANDARD.encode("no-separator"),
            STANDARD.encode([0xff, 0x00, 0x01]),
            String::new(),
        ] {
            let response =
                call_without_database(Body::Text(json!({ "after": cursor }).to_string())).await;
            assert_eq!(response.status(), 400, "cursor: {cursor:?}");
            let body = json_body(&response);
            assert_eq!(body["error"], "Invalid cursor");
            assert!(body["detail"].is_string());
        }
    }

    #[tokio::test]
    async fn handler_rejects_non_uuid_cursors_before_pool_initialization() {
        for id in ["", "not-a-uuid", "550e8400-e29b-41d4-a716-44665544000g"] {
            let response = call_without_database(Body::Text(
                json!({ "after": encode_cursor("Alice", id) }).to_string(),
            ))
            .await;
            assert_eq!(response.status(), 400, "cursor id: {id:?}");
            let body = json_body(&response);
            assert_eq!(body["error"], "Invalid cursor");
            assert!(body["detail"].is_string());
        }
    }

    #[tokio::test]
    async fn handler_rejects_zero_limit_before_pool_initialization() {
        let response = call_without_database(Body::Text(json!({ "limit": 0 }).to_string())).await;
        assert_eq!(response.status(), 400);
        let body = json_body(&response);
        assert_eq!(body["error"], "Invalid request body");
        assert!(body["detail"].as_str().unwrap().contains("limit"));
    }

    #[tokio::test]
    async fn handler_rejects_invalid_request_fields_before_pool_initialization() {
        for body in [
            json!({ "name": 1 }),
            json!({ "after": false }),
            json!({ "limit": "1" }),
            json!({ "limit": -1 }),
            json!({ "limit": 1.5 }),
            json!({ "limit": u64::from(u32::MAX) + 1 }),
            json!(null),
            json!([]),
        ] {
            let response = call_without_database(Body::Text(body.to_string())).await;
            assert_eq!(response.status(), 400, "request: {body}");
            let response_body = json_body(&response);
            assert_eq!(response_body["error"], "Invalid request body");
            assert!(response_body["detail"].is_string());
        }
        for body in [
            Body::Text("not JSON".into()),
            Body::Binary(vec![0xff]),
            Body::Text(r#"{"name":"Alice","name":"Bob"}"#.into()),
            Body::Text(r#"{"after":null,"after":null}"#.into()),
            Body::Text(r#"{"limit":1,"limit":2}"#.into()),
        ] {
            let response = call_without_database(body).await;
            assert_eq!(response.status(), 400);
            assert_eq!(json_body(&response)["error"], "Invalid request body");
        }
    }

    #[tokio::test]
    async fn handler_rejects_nul_name_before_pool_initialization() {
        let response =
            call_without_database(Body::Text(json!({ "name": "Alice\0" }).to_string())).await;
        assert_eq!(response.status(), 400);
        let body = json_body(&response);
        assert_eq!(body["error"], "Invalid request body");
        assert!(body["detail"].as_str().unwrap().contains("name"));
    }

    #[tokio::test]
    async fn handler_pool_failure_returns_generic_500() {
        let response = call_without_database(Body::Empty).await;
        assert_eq!(response.status(), 500);
        assert_eq!(
            json_body(&response),
            json!({ "error": "Internal server error" })
        );
    }
}
