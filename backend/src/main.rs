use std::{
    collections::HashMap,
    path::PathBuf,
    process::Stdio,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

use axum::{
    extract::{Path, Query, Request, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tokio::{
    fs,
    io::{AsyncBufReadExt, AsyncRead, AsyncWriteExt, BufReader},
    process::Command,
    sync::{mpsc, Mutex},
    time::{timeout, Duration},
};
use tower_http::cors::{Any, CorsLayer};

const DOCKER_CMD_TIMEOUT_SECS: u64 = 60;
const CONTAINER_LOG_TAIL_DEFAULT: usize = 200;
const CONTAINER_LOG_TAIL_MAX: usize = 5000;
const AUDIT_QUERY_LIMIT_DEFAULT: usize = 200;
const AUDIT_QUERY_LIMIT_MAX: usize = 2000;
const LIST_QUERY_LIMIT_MAX: usize = 5000;
const PULL_TASK_MAX_COUNT: usize = 100;
const PULL_TASK_MAX_LOG_LINES: usize = 2000;

#[derive(Clone)]
struct AppState {
    audit: Arc<AuditLogger>,
    pull_tasks: Arc<Mutex<HashMap<String, PullTaskState>>>,
    pull_counter: Arc<AtomicU64>,
    auth_token: String,
}

#[derive(Clone)]
struct AuditLogger {
    file_path: PathBuf,
    lock: Arc<Mutex<()>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AuditRecord {
    at: DateTime<Utc>,
    action: String,
    target: String,
    result: String,
    detail: Option<String>,
}

#[derive(Debug, Clone)]
struct PullTaskState {
    image: String,
    status: String,
    logs: Vec<String>,
    done: bool,
    error: Option<String>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    message: String,
    docker_version: String,
}

#[derive(Debug, Serialize)]
struct SimpleResponse {
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PullStartResponse {
    message: String,
    task_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PullProgressResponse {
    task_id: String,
    image: String,
    status: String,
    logs: Vec<String>,
    next_from: usize,
    done: bool,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuditListResponse {
    records: Vec<AuditRecord>,
    total: usize,
    from: usize,
    limit: usize,
    has_more: bool,
    next_from: usize,
}

#[derive(Debug, Deserialize)]
struct PullProgressQuery {
    from: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct ListQuery {
    limit: Option<usize>,
    from: Option<usize>,
    q: Option<String>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LogQuery {
    tail: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct AuditQuery {
    limit: Option<usize>,
    from: Option<usize>,
    q: Option<String>,
    result: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RemoveQuery {
    force: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct CreateContainerRequest {
    image: String,
    name: Option<String>,
    env: Option<Vec<String>>,
    ports: Option<Vec<String>>,
    volumes: Option<Vec<String>>,
    network: Option<String>,
    command: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct PullImageRequest {
    image: String,
}

#[derive(Debug, Deserialize)]
struct AuthLoginRequest {
    token: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ContainerSummary {
    #[serde(alias = "ID")]
    id: Option<String>,
    #[serde(alias = "Names")]
    names: Option<String>,
    #[serde(alias = "Image")]
    image: Option<String>,
    #[serde(alias = "State")]
    state: Option<String>,
    #[serde(alias = "Status")]
    status: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ImageSummary {
    #[serde(alias = "ID")]
    id: Option<String>,
    #[serde(alias = "Repository")]
    repository: Option<String>,
    #[serde(alias = "Tag")]
    tag: Option<String>,
    #[serde(alias = "Size")]
    size: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct VolumeSummary {
    #[serde(alias = "Name")]
    name: Option<String>,
    #[serde(alias = "Driver")]
    driver: Option<String>,
    #[serde(alias = "Mountpoint")]
    mountpoint: Option<String>,
    #[serde(alias = "Scope")]
    scope: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct NetworkSummary {
    #[serde(alias = "ID")]
    id: Option<String>,
    #[serde(alias = "Name")]
    name: Option<String>,
    #[serde(alias = "Driver")]
    driver: Option<String>,
    #[serde(alias = "Scope")]
    scope: Option<String>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let auth_token = load_auth_token();
    let audit_logger = AuditLogger::new("data/audit.log".into()).await?;
    let state = AppState {
        audit: Arc::new(audit_logger),
        pull_tasks: Arc::new(Mutex::new(HashMap::new())),
        pull_counter: Arc::new(AtomicU64::new(1)),
        auth_token,
    };

    let protected_api = Router::new()
        .route("/api/images", get(list_images))
        .route("/api/images/pull", post(pull_image))
        .route("/api/images/pull/:task_id", get(get_pull_progress))
        .route("/api/containers", get(list_containers))
        .route("/api/containers/create", post(create_container))
        .route("/api/containers/:id/start", post(start_container))
        .route("/api/containers/:id/stop", post(stop_container))
        .route("/api/containers/:id/restart", post(restart_container))
        .route("/api/containers/:id", delete(remove_container))
        .route("/api/containers/:id/logs", get(container_logs))
        .route("/api/volumes", get(list_volumes))
        .route("/api/networks", get(list_networks))
        .route("/api/audit", get(get_audit))
        .route("/api/auth/me", get(auth_me))
        .layer(middleware::from_fn_with_state(state.clone(), require_auth));

    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/auth/login", post(auth_login))
        .merge(protected_api)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state);

    let bind_addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".to_string());
    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    println!("backend started at http://{bind_addr}");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> Json<HealthResponse> {
    let output = run_docker(&["version", "--format", "{{json .Server.Version}}"]).await;
    match output {
        Ok(version) => Json(HealthResponse {
            message: "ok".to_string(),
            docker_version: version.trim().trim_matches('"').to_string(),
        }),
        Err(_) => Json(HealthResponse {
            message: "ok".to_string(),
            docker_version: "unknown".to_string(),
        }),
    }
}

async fn auth_login(
    State(state): State<AppState>,
    Json(req): Json<AuthLoginRequest>,
) -> Result<Json<SimpleResponse>, ApiError> {
    let token = req.token.trim();
    if token.is_empty() {
        return Err(ApiError::bad_request("token 不能为空"));
    }
    if token != state.auth_token {
        return Err(ApiError::unauthorized("token 无效"));
    }

    Ok(Json(SimpleResponse {
        message: "登录成功".to_string(),
    }))
}

async fn auth_me() -> Json<SimpleResponse> {
    Json(SimpleResponse {
        message: "ok".to_string(),
    })
}

async fn require_auth(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Result<axum::response::Response, ApiError> {
    if req.method() == Method::OPTIONS {
        return Ok(next.run(req).await);
    }

    match extract_bearer_token(req.headers()) {
        Some(token) if token == state.auth_token => Ok(next.run(req).await),
        _ => Err(ApiError::unauthorized("未登录或 token 无效")),
    }
}

fn extract_bearer_token(headers: &HeaderMap) -> Option<&str> {
    let value = headers.get(header::AUTHORIZATION)?.to_str().ok()?.trim();
    let (scheme, token) = value.split_once(' ')?;
    if scheme.eq_ignore_ascii_case("Bearer") {
        let token = token.trim();
        (!token.is_empty()).then_some(token)
    } else {
        None
    }
}

fn load_auth_token() -> String {
    std::env::var("AUTH_TOKEN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "docker-manage-token".to_string())
}

async fn list_images(Query(query): Query<ListQuery>) -> Result<impl IntoResponse, ApiError> {
    let text = run_docker(&["image", "ls", "--format", "{{json .}}", "--no-trunc"]).await?;
    let items = apply_image_filters(parse_json_lines::<ImageSummary>(&text)?, query.q.as_deref());
    let page = paginate_list(items, query.from, query.limit);
    Ok((build_list_headers(&page), Json(page.items)))
}

async fn list_containers(Query(query): Query<ListQuery>) -> Result<impl IntoResponse, ApiError> {
    let text = run_docker(&["ps", "-a", "--format", "{{json .}}", "--no-trunc"]).await?;
    let items = apply_container_filters(
        parse_json_lines::<ContainerSummary>(&text)?,
        query.q.as_deref(),
        query.status.as_deref(),
    );
    let page = paginate_list(items, query.from, query.limit);
    Ok((build_list_headers(&page), Json(page.items)))
}

async fn list_volumes(Query(query): Query<ListQuery>) -> Result<impl IntoResponse, ApiError> {
    let text = run_docker(&["volume", "ls", "--format", "{{json .}}"]).await?;
    let page = paginate_list(
        parse_json_lines::<VolumeSummary>(&text)?,
        query.from,
        query.limit,
    );
    Ok((build_list_headers(&page), Json(page.items)))
}

async fn list_networks(Query(query): Query<ListQuery>) -> Result<impl IntoResponse, ApiError> {
    let text = run_docker(&["network", "ls", "--format", "{{json .}}", "--no-trunc"]).await?;
    let page = paginate_list(
        parse_json_lines::<NetworkSummary>(&text)?,
        query.from,
        query.limit,
    );
    Ok((build_list_headers(&page), Json(page.items)))
}

async fn start_container(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SimpleResponse>, ApiError> {
    let res = run_docker(&["start", &id]).await;
    audit_result(&state, "container.start", &id, &res).await;
    res?;
    Ok(Json(SimpleResponse {
        message: format!("容器已启动: {id}"),
    }))
}

async fn stop_container(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SimpleResponse>, ApiError> {
    let res = run_docker(&["stop", &id]).await;
    audit_result(&state, "container.stop", &id, &res).await;
    res?;
    Ok(Json(SimpleResponse {
        message: format!("容器已停止: {id}"),
    }))
}

async fn restart_container(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SimpleResponse>, ApiError> {
    let res = run_docker(&["restart", &id]).await;
    audit_result(&state, "container.restart", &id, &res).await;
    res?;
    Ok(Json(SimpleResponse {
        message: format!("容器已重启: {id}"),
    }))
}

async fn remove_container(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<RemoveQuery>,
) -> Result<Json<SimpleResponse>, ApiError> {
    let mut args = vec!["rm"];
    if query.force.unwrap_or(true) {
        args.push("-f");
    }
    args.push(&id);
    let res = run_docker(&args).await;
    audit_result(&state, "container.remove", &id, &res).await;
    res?;
    Ok(Json(SimpleResponse {
        message: format!("容器已删除: {id}"),
    }))
}

async fn create_container(
    State(state): State<AppState>,
    Json(req): Json<CreateContainerRequest>,
) -> Result<Json<SimpleResponse>, ApiError> {
    validate_create_request(&req)?;

    let mut args = vec!["create".to_string()];

    if let Some(name) = &req.name {
        let name = name.trim();
        if !name.is_empty() {
            args.push("--name".to_string());
            args.push(name.to_string());
        }
    }

    if let Some(envs) = &req.env {
        for e in envs {
            let item = e.trim();
            if !item.is_empty() {
                args.push("-e".to_string());
                args.push(item.to_string());
            }
        }
    }

    if let Some(ports) = &req.ports {
        for p in ports {
            let item = p.trim();
            if !item.is_empty() {
                args.push("-p".to_string());
                args.push(item.to_string());
            }
        }
    }

    if let Some(volumes) = &req.volumes {
        for v in volumes {
            let item = v.trim();
            if !item.is_empty() {
                args.push("-v".to_string());
                args.push(item.to_string());
            }
        }
    }

    if let Some(network) = &req.network {
        let item = network.trim();
        if !item.is_empty() {
            args.push("--network".to_string());
            args.push(item.to_string());
        }
    }

    args.push(req.image.trim().to_string());

    if let Some(cmd) = &req.command {
        for c in cmd {
            let item = c.trim();
            if !item.is_empty() {
                args.push(item.to_string());
            }
        }
    }

    let refs = args.iter().map(String::as_str).collect::<Vec<_>>();
    let target = req
        .name
        .as_ref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .unwrap_or(req.image.trim());

    let res = run_docker(&refs).await;
    audit_result(&state, "container.create", target, &res).await;
    let out = res?;
    Ok(Json(SimpleResponse {
        message: format!("容器创建成功: {}", out.trim()),
    }))
}

async fn pull_image(
    State(state): State<AppState>,
    Json(req): Json<PullImageRequest>,
) -> Result<Json<PullStartResponse>, ApiError> {
    let image = req.image.trim();
    if image.is_empty() {
        return Err(ApiError::bad_request("image 不能为空"));
    }
    if image.contains(char::is_whitespace) {
        return Err(ApiError::bad_request("image 格式非法，不能包含空白字符"));
    }

    let task_id = format!(
        "pull-{}-{}",
        Utc::now().timestamp_millis(),
        state.pull_counter.fetch_add(1, Ordering::Relaxed)
    );

    {
        let mut tasks = state.pull_tasks.lock().await;
        prune_pull_tasks(&mut tasks);
        tasks.insert(
            task_id.clone(),
            PullTaskState {
                image: image.to_string(),
                status: "pending".to_string(),
                logs: vec!["任务已创建，等待执行...".to_string()],
                done: false,
                error: None,
                updated_at: Utc::now(),
            },
        );
    }

    let tasks = state.pull_tasks.clone();
    let audit = state.audit.clone();
    let image_owned = image.to_string();
    let task_id_owned = task_id.clone();

    tokio::spawn(async move {
        run_pull_task(tasks, audit, task_id_owned, image_owned).await;
    });

    Ok(Json(PullStartResponse {
        message: "镜像拉取任务已启动".to_string(),
        task_id,
    }))
}

async fn get_pull_progress(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
    Query(query): Query<PullProgressQuery>,
) -> Result<Json<PullProgressResponse>, ApiError> {
    let from = query.from.unwrap_or(0);
    let tasks = state.pull_tasks.lock().await;
    let task = tasks
        .get(&task_id)
        .ok_or_else(|| ApiError::bad_request("任务不存在"))?;

    let next_from = task.logs.len();
    let logs = if from >= next_from {
        vec![]
    } else {
        task.logs[from..].to_vec()
    };

    Ok(Json(PullProgressResponse {
        task_id,
        image: task.image.clone(),
        status: task.status.clone(),
        logs,
        next_from,
        done: task.done,
        error: task.error.clone(),
    }))
}

async fn container_logs(
    Path(id): Path<String>,
    Query(query): Query<LogQuery>,
) -> Result<Json<Vec<String>>, ApiError> {
    let tail = clamp_container_log_tail(query.tail).to_string();
    let text = run_docker(&["logs", "--tail", &tail, &id]).await?;
    let logs = text
        .lines()
        .map(|v| v.trim_end().to_string())
        .filter(|v| !v.is_empty())
        .collect::<Vec<_>>();
    Ok(Json(logs))
}

async fn get_audit(
    State(state): State<AppState>,
    Query(query): Query<AuditQuery>,
) -> Result<Json<AuditListResponse>, ApiError> {
    let limit = clamp_audit_query_limit(query.limit);
    let from = query.from.unwrap_or(0);
    let keyword = normalize_optional_query(query.q.as_deref());
    let result_filter = normalize_optional_result_filter(query.result.as_deref());

    let all_records = state.audit.read_all().await.map_err(ApiError::internal)?;
    let filtered_records = all_records
        .into_iter()
        .filter(|record| audit_record_matches(record, keyword.as_deref(), result_filter.as_deref()))
        .collect::<Vec<_>>();
    let total = filtered_records.len();

    let records = filtered_records
        .iter()
        .skip(from)
        .take(limit)
        .cloned()
        .collect::<Vec<_>>();
    let next_from = from.saturating_add(records.len());
    let has_more = next_from < total;

    Ok(Json(AuditListResponse {
        records,
        total,
        from,
        limit,
        has_more,
        next_from,
    }))
}

async fn run_pull_task(
    tasks: Arc<Mutex<HashMap<String, PullTaskState>>>,
    audit: Arc<AuditLogger>,
    task_id: String,
    image: String,
) {
    update_pull_task(&tasks, &task_id, |task| {
        task.status = "running".to_string();
        push_pull_log(task, format!("开始拉取镜像: {image}"));
    })
    .await;

    let spawn_result = Command::new("docker")
        .args(["pull", &image])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    let mut child = match spawn_result {
        Ok(c) => c,
        Err(e) => {
            update_pull_task(&tasks, &task_id, |task| {
                task.status = "failed".to_string();
                task.done = true;
                task.error = Some(e.to_string());
                push_pull_log(task, format!("启动拉取失败: {e}"));
            })
            .await;
            let _ = audit
                .append(AuditRecord {
                    at: Utc::now(),
                    action: "image.pull".to_string(),
                    target: image,
                    result: "failed".to_string(),
                    detail: Some(e.to_string()),
                })
                .await;
            return;
        }
    };

    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    if let Some(stdout) = child.stdout.take() {
        let tx_out = tx.clone();
        tokio::spawn(async move {
            stream_lines(stdout, tx_out, "").await;
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let tx_err = tx.clone();
        tokio::spawn(async move {
            stream_lines(stderr, tx_err, "ERR ").await;
        });
    }
    drop(tx);

    while let Some(line) = rx.recv().await {
        update_pull_task(&tasks, &task_id, |task| {
            push_pull_log(task, line);
        })
        .await;
    }

    match child.wait().await {
        Ok(status) if status.success() => {
            update_pull_task(&tasks, &task_id, |task| {
                task.status = "success".to_string();
                task.done = true;
                push_pull_log(task, "镜像拉取完成");
            })
            .await;
            let _ = audit
                .append(AuditRecord {
                    at: Utc::now(),
                    action: "image.pull".to_string(),
                    target: image,
                    result: "success".to_string(),
                    detail: None,
                })
                .await;
        }
        Ok(status) => {
            let msg = format!("docker pull 执行失败，exit_code={:?}", status.code());
            update_pull_task(&tasks, &task_id, |task| {
                task.status = "failed".to_string();
                task.done = true;
                task.error = Some(msg.clone());
                push_pull_log(task, msg.clone());
            })
            .await;
            let _ = audit
                .append(AuditRecord {
                    at: Utc::now(),
                    action: "image.pull".to_string(),
                    target: image,
                    result: "failed".to_string(),
                    detail: Some(msg),
                })
                .await;
        }
        Err(e) => {
            update_pull_task(&tasks, &task_id, |task| {
                task.status = "failed".to_string();
                task.done = true;
                task.error = Some(e.to_string());
                push_pull_log(task, format!("等待任务结束失败: {e}"));
            })
            .await;
            let _ = audit
                .append(AuditRecord {
                    at: Utc::now(),
                    action: "image.pull".to_string(),
                    target: image,
                    result: "failed".to_string(),
                    detail: Some(e.to_string()),
                })
                .await;
        }
    }
}

async fn stream_lines<R>(reader: R, tx: mpsc::UnboundedSender<String>, prefix: &str)
where
    R: AsyncRead + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let text = line.trim();
        if text.is_empty() {
            continue;
        }
        let _ = tx.send(format!("{prefix}{text}"));
    }
}

async fn update_pull_task<F>(
    tasks: &Arc<Mutex<HashMap<String, PullTaskState>>>,
    task_id: &str,
    f: F,
) where
    F: FnOnce(&mut PullTaskState),
{
    let mut map = tasks.lock().await;
    if let Some(task) = map.get_mut(task_id) {
        f(task);
        task.updated_at = Utc::now();
    }
}

fn clamp_container_log_tail(raw: Option<usize>) -> usize {
    raw.unwrap_or(CONTAINER_LOG_TAIL_DEFAULT)
        .clamp(1, CONTAINER_LOG_TAIL_MAX)
}

fn clamp_list_query_limit(raw: Option<usize>) -> Option<usize> {
    raw.map(|value| value.clamp(1, LIST_QUERY_LIMIT_MAX))
}

struct ListPageData<T> {
    items: Vec<T>,
    total: usize,
    from: usize,
    limit: Option<usize>,
    next_from: usize,
    has_more: bool,
}

fn paginate_list<T>(items: Vec<T>, from: Option<usize>, limit: Option<usize>) -> ListPageData<T> {
    let from = from.unwrap_or(0);
    let limit = clamp_list_query_limit(limit);
    let total = items.len();

    let page_items = if let Some(limit) = limit {
        items.into_iter().skip(from).take(limit).collect::<Vec<_>>()
    } else {
        items.into_iter().skip(from).collect::<Vec<_>>()
    };

    let next_from = from.saturating_add(page_items.len());
    let has_more = next_from < total;

    ListPageData {
        items: page_items,
        total,
        from,
        limit,
        next_from,
        has_more,
    }
}

fn build_list_headers<T>(page: &ListPageData<T>) -> HeaderMap {
    let mut headers = HeaderMap::new();
    set_usize_header(&mut headers, "X-Total-Count", page.total);
    set_usize_header(&mut headers, "X-List-From", page.from);
    if let Some(limit) = page.limit {
        set_usize_header(&mut headers, "X-List-Limit", limit);
    }
    set_usize_header(&mut headers, "X-Next-From", page.next_from);
    headers.insert(
        "X-Has-More",
        HeaderValue::from_str(if page.has_more { "true" } else { "false" })
            .unwrap_or(HeaderValue::from_static("false")),
    );
    headers
}

fn set_usize_header(headers: &mut HeaderMap, name: &'static str, value: usize) {
    if let Ok(header_value) = HeaderValue::from_str(&value.to_string()) {
        headers.insert(name, header_value);
    }
}

fn apply_container_filters(
    items: Vec<ContainerSummary>,
    query: Option<&str>,
    status: Option<&str>,
) -> Vec<ContainerSummary> {
    let query = normalize_optional_query(query);
    let status = normalize_optional_status_filter(status);

    items
        .into_iter()
        .filter(|item| container_matches(item, query.as_deref(), status.as_deref()))
        .collect()
}

fn apply_image_filters(items: Vec<ImageSummary>, query: Option<&str>) -> Vec<ImageSummary> {
    let query = normalize_optional_query(query);

    items
        .into_iter()
        .filter(|item| image_matches(item, query.as_deref()))
        .collect()
}

fn normalize_optional_status_filter(raw: Option<&str>) -> Option<String> {
    raw.map(str::trim)
        .filter(|v| !v.is_empty() && !v.eq_ignore_ascii_case("all"))
        .map(|v| v.to_ascii_lowercase())
}

fn container_matches(item: &ContainerSummary, query: Option<&str>, status: Option<&str>) -> bool {
    if let Some(status) = status {
        let category = get_container_status_category(item);
        if category != status {
            return false;
        }
    }

    if let Some(q) = query {
        let haystack = format!(
            "{} {} {} {}",
            item.names.as_deref().unwrap_or_default(),
            item.image.as_deref().unwrap_or_default(),
            item.status.as_deref().unwrap_or_default(),
            item.id.as_deref().unwrap_or_default(),
        )
        .to_lowercase();

        if !haystack.contains(q) {
            return false;
        }
    }

    true
}

fn image_matches(item: &ImageSummary, query: Option<&str>) -> bool {
    if let Some(q) = query {
        let haystack = format!(
            "{} {} {}",
            item.repository.as_deref().unwrap_or_default(),
            item.tag.as_deref().unwrap_or_default(),
            item.id.as_deref().unwrap_or_default(),
        )
        .to_lowercase();

        if !haystack.contains(q) {
            return false;
        }
    }

    true
}

fn is_running_container(item: &ContainerSummary) -> bool {
    let state = item
        .state
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let status = item
        .status
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    state == "running" || status.contains("up")
}

fn get_container_status_category(item: &ContainerSummary) -> String {
    if is_running_container(item) {
        return "running".to_string();
    }

    let status = item
        .status
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if status.contains("exited")
        || status.contains("stopped")
        || status.contains("created")
        || status.contains("dead")
    {
        return "stopped".to_string();
    }

    "other".to_string()
}

fn clamp_audit_query_limit(raw: Option<usize>) -> usize {
    raw.unwrap_or(AUDIT_QUERY_LIMIT_DEFAULT)
        .clamp(1, AUDIT_QUERY_LIMIT_MAX)
}

fn normalize_optional_query(raw: Option<&str>) -> Option<String> {
    raw.map(str::trim)
        .filter(|v| !v.is_empty())
        .map(|v| v.to_lowercase())
}

fn normalize_optional_result_filter(raw: Option<&str>) -> Option<String> {
    raw.map(str::trim)
        .filter(|v| !v.is_empty() && !v.eq_ignore_ascii_case("all"))
        .map(|v| v.to_ascii_lowercase())
}

fn audit_record_matches(
    record: &AuditRecord,
    keyword: Option<&str>,
    result_filter: Option<&str>,
) -> bool {
    if let Some(result) = result_filter {
        if !record.result.eq_ignore_ascii_case(result) {
            return false;
        }
    }

    if let Some(q) = keyword {
        let detail = record.detail.as_deref().unwrap_or("");
        let haystack = format!(
            "{} {} {} {} {}",
            record.action, record.target, record.result, detail, record.at
        )
        .to_lowercase();
        if !haystack.contains(q) {
            return false;
        }
    }

    true
}

fn push_pull_log(task: &mut PullTaskState, line: impl Into<String>) {
    task.logs.push(line.into());
    let overflow = task.logs.len().saturating_sub(PULL_TASK_MAX_LOG_LINES);
    if overflow > 0 {
        task.logs.drain(0..overflow);
    }
}

fn prune_pull_tasks(tasks: &mut HashMap<String, PullTaskState>) {
    if tasks.len() <= PULL_TASK_MAX_COUNT {
        return;
    }

    let mut done_ids = tasks
        .iter()
        .filter_map(|(id, task)| {
            task.done
                .then_some((id.clone(), task.updated_at.timestamp_millis()))
        })
        .collect::<Vec<_>>();
    done_ids.sort_by_key(|(_, ts)| *ts);

    for (id, _) in done_ids {
        if tasks.len() <= PULL_TASK_MAX_COUNT {
            return;
        }
        tasks.remove(&id);
    }

    let mut all_ids = tasks
        .iter()
        .map(|(id, task)| (id.clone(), task.updated_at.timestamp_millis()))
        .collect::<Vec<_>>();
    all_ids.sort_by_key(|(_, ts)| *ts);

    for (id, _) in all_ids {
        if tasks.len() <= PULL_TASK_MAX_COUNT {
            break;
        }
        tasks.remove(&id);
    }
}

fn validate_create_request(req: &CreateContainerRequest) -> Result<(), ApiError> {
    let image = req.image.trim();
    if image.is_empty() {
        return Err(ApiError::bad_request("image 不能为空"));
    }
    if image.contains(char::is_whitespace) {
        return Err(ApiError::bad_request("image 格式非法，不能包含空白字符"));
    }

    if let Some(name) = &req.name {
        let name = name.trim();
        if !name.is_empty() && !is_valid_container_name(name) {
            return Err(ApiError::bad_request(
                "容器名称不合法，只允许字母/数字/._-，且需以字母或数字开头",
            ));
        }
    }

    if let Some(ports) = &req.ports {
        for port in ports {
            let p = port.trim();
            if p.is_empty() {
                continue;
            }
            if !is_valid_port_mapping(p) {
                return Err(ApiError::bad_request(
                    "端口映射不合法，格式应为 宿主端口:容器端口（1-65535）",
                ));
            }
        }
    }

    if let Some(envs) = &req.env {
        for env in envs {
            let e = env.trim();
            if e.is_empty() {
                continue;
            }
            if !is_valid_env_pair(e) {
                return Err(ApiError::bad_request(
                    "环境变量格式不合法，应为 KEY=VALUE，KEY 仅支持字母数字下划线且不能数字开头",
                ));
            }
        }
    }

    if let Some(volumes) = &req.volumes {
        for volume in volumes {
            let v = volume.trim();
            if v.is_empty() {
                continue;
            }
            if !is_valid_volume_spec(v) {
                return Err(ApiError::bad_request(
                    "卷挂载格式不合法，应为 source:target 或 source:target:mode",
                ));
            }
        }
    }

    if let Some(network) = &req.network {
        let n = network.trim();
        if !n.is_empty() && !is_valid_network_name(n) {
            return Err(ApiError::bad_request(
                "网络名称不合法，只允许字母/数字/._-，且需以字母或数字开头",
            ));
        }
    }

    Ok(())
}

fn is_valid_container_name(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !first.is_ascii_alphanumeric() {
        return false;
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-')
}

fn is_valid_port_mapping(value: &str) -> bool {
    let mut it = value.split(':');
    let Some(host) = it.next() else { return false };
    let Some(container) = it.next() else {
        return false;
    };
    if it.next().is_some() {
        return false;
    }
    is_valid_port(host) && is_valid_port(container)
}

fn is_valid_port(value: &str) -> bool {
    if value.is_empty() || !value.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }
    match value.parse::<u16>() {
        Ok(v) => v > 0,
        Err(_) => false,
    }
}

fn is_valid_env_pair(value: &str) -> bool {
    let mut it = value.splitn(2, '=');
    let Some(key) = it.next() else { return false };
    let Some(_val) = it.next() else { return false };
    is_valid_env_key(key)
}

fn is_valid_env_key(key: &str) -> bool {
    if key.is_empty() {
        return false;
    }
    let mut chars = key.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn is_valid_network_name(name: &str) -> bool {
    is_valid_container_name(name)
}

fn is_valid_volume_spec(value: &str) -> bool {
    if value.is_empty() || value.chars().any(char::is_control) {
        return false;
    }

    let (left, right, mode) = split_volume_spec(value);
    if left.is_empty() || right.is_empty() {
        return false;
    }

    if let Some(m) = mode {
        let mode = m.trim();
        if mode.is_empty() {
            return false;
        }
    }

    true
}

fn split_volume_spec(value: &str) -> (&str, &str, Option<&str>) {
    let Some(last_colon) = value.rfind(':') else {
        return ("", "", None);
    };

    let tail = &value[last_colon + 1..];
    let head = &value[..last_colon];

    let maybe_mode = matches!(
        tail,
        "ro" | "rw" | "z" | "Z" | "cached" | "delegated" | "consistent"
    );

    if maybe_mode {
        let Some(mid_colon) = head.rfind(':') else {
            return ("", "", Some(tail));
        };
        let source = &head[..mid_colon];
        let target = &head[mid_colon + 1..];
        return (source, target, Some(tail));
    }

    (head, tail, None)
}

async fn audit_result(
    state: &AppState,
    action: &str,
    target: &str,
    result: &Result<String, ApiError>,
) {
    let (status, detail) = match result {
        Ok(_) => ("success".to_string(), None),
        Err(e) => ("failed".to_string(), Some(e.message.clone())),
    };
    let _ = state
        .audit
        .append(AuditRecord {
            at: Utc::now(),
            action: action.to_string(),
            target: target.to_string(),
            result: status,
            detail,
        })
        .await;
}

async fn run_docker(args: &[&str]) -> Result<String, ApiError> {
    let output = timeout(
        Duration::from_secs(DOCKER_CMD_TIMEOUT_SECS),
        Command::new("docker").args(args).output(),
    )
    .await
    .map_err(|_| ApiError {
        status: StatusCode::GATEWAY_TIMEOUT,
        message: format!(
            "docker 命令执行超时（>{DOCKER_CMD_TIMEOUT_SECS}s），请检查 Docker Engine 状态"
        ),
    })?
    .map_err(ApiError::internal)?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        Err(ApiError {
            status: StatusCode::BAD_GATEWAY,
            message: if err.trim().is_empty() {
                "docker 命令执行失败".to_string()
            } else {
                err
            },
        })
    }
}

fn parse_json_lines<T: DeserializeOwned>(text: &str) -> Result<Vec<T>, ApiError> {
    let mut items = Vec::new();
    for line in text.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let item = serde_json::from_str::<T>(line).map_err(ApiError::internal)?;
        items.push(item);
    }
    Ok(items)
}

impl AuditLogger {
    async fn new(file_path: PathBuf) -> Result<Self, std::io::Error> {
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).await?;
        }
        if fs::metadata(&file_path).await.is_err() {
            fs::write(&file_path, "").await?;
        }
        Ok(Self {
            file_path,
            lock: Arc::new(Mutex::new(())),
        })
    }

    async fn append(&self, record: AuditRecord) -> Result<(), std::io::Error> {
        let _guard = self.lock.lock().await;
        let mut file = fs::OpenOptions::new()
            .append(true)
            .open(&self.file_path)
            .await?;
        let line = format!("{}\n", serde_json::to_string(&record).unwrap_or_default());
        file.write_all(line.as_bytes()).await
    }

    async fn read_all(&self) -> Result<Vec<AuditRecord>, std::io::Error> {
        let content = fs::read_to_string(&self.file_path).await?;
        let mut records = vec![];
        for line in content.lines() {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(item) = serde_json::from_str::<AuditRecord>(line) {
                records.push(item);
            }
        }
        records.reverse();
        Ok(records)
    }
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn internal<E: std::fmt::Display>(err: E) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: err.to_string(),
        }
    }

    fn bad_request(message: &str) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.to_string(),
        }
    }

    fn unauthorized(message: &str) -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            message: message.to_string(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        (
            self.status,
            Json(serde_json::json!({
                "error": self.message,
            })),
        )
            .into_response()
    }
}
