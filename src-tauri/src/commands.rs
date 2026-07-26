

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use serde::Serialize;

use crate::archive::create::{create_archive as do_create, CreateRequest, CreateResult};
use crate::archive::extract::{extract_archive as do_extract, ExtractRequest, ExtractResult};
use crate::archive::inspect::{inspect, ArchiveInfo};
use crate::archive::rar;
use crate::crack::engine::{self, CrackJob};
use crate::crack::{AttackConfig, CrackConfig, ProgressMsg};
use crate::error::{AppError, AppResult};
use crate::job::checkpoint::{self, CheckpointMeta};
use crate::job::control::JobControl;
use crate::state::AppState;

#[tauri::command]
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}


#[tauri::command]
pub fn rar_cli_available(rar_path: Option<String>) -> bool {
    rar::rar_cli_available(rar_path.as_deref())
}

#[tauri::command]
pub async fn create_archive(req: CreateRequest) -> AppResult<CreateResult> {
    tauri::async_runtime::spawn_blocking(move || do_create(req))
        .await
        .map_err(|e| AppError::invalid(format!("task failed: {e}")))?
}

#[tauri::command]
pub async fn inspect_archive(path: PathBuf) -> AppResult<ArchiveInfo> {
    tauri::async_runtime::spawn_blocking(move || inspect(&path))
        .await
        .map_err(|e| AppError::invalid(format!("task failed: {e}")))?
}

#[tauri::command]
pub async fn extract_archive(req: ExtractRequest) -> AppResult<ExtractResult> {
    tauri::async_runtime::spawn_blocking(move || do_extract(req))
        .await
        .map_err(|e| AppError::invalid(format!("task failed: {e}")))?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttackPreview {

    pub total: Option<u64>,

    pub samples: Vec<String>,

    pub truncated: bool,
}


#[tauri::command]
pub async fn preview_attack(attack: AttackConfig) -> AppResult<AttackPreview> {
    const N: usize = 14;
    tauri::async_runtime::spawn_blocking(move || {
        let (total, samples) = engine::preview(&attack, N)?;
        let truncated = match total {
            Some(t) => (t as usize) > samples.len(),
            None => samples.len() >= N,
        };
        Ok(AttackPreview { total, samples, truncated })
    })
    .await
    .map_err(|e| AppError::invalid(format!("task failed: {e}")))?
}

fn new_job_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("job-{t}-{n}")
}

fn checkpoint_dir(app: &AppHandle) -> AppResult<PathBuf> {
    app.path()
        .app_data_dir()
        .map_err(|e| AppError::invalid(format!("no app data dir: {e}")))
}


fn spawn_job(
    job: CrackJob,
    control: Arc<JobControl>,
    on_progress: Channel<ProgressMsg>,
    jobs: Arc<Mutex<HashMap<String, Arc<JobControl>>>>,
) {
    let id = job.id.clone();
    std::thread::spawn(move || {
        engine::run(job, control, on_progress);
        if let Ok(mut map) = jobs.lock() {
            map.remove(&id);
        }
    });
}

#[tauri::command]
pub fn start_crack(
    app: AppHandle,
    cfg: CrackConfig,
    on_progress: Channel<ProgressMsg>,
    state: State<AppState>,
) -> AppResult<String> {
    let id = new_job_id();
    let control = Arc::new(JobControl::new());
    state.jobs.lock().unwrap().insert(id.clone(), control.clone());

    let job = CrackJob {
        id: id.clone(),
        archive: cfg.archive,
        entry: cfg.entry,
        attack: cfg.attack,
        threads: cfg.threads,
        checkpoint_dir: checkpoint_dir(&app)?,
        start_position: 0,
        start_tried: 0,
    };
    spawn_job(job, control, on_progress, state.jobs.clone());
    Ok(id)
}

#[tauri::command]
pub fn resume_job(
    app: AppHandle,
    job_id: String,
    on_progress: Channel<ProgressMsg>,
    state: State<AppState>,
) -> AppResult<()> {
    let dir = checkpoint_dir(&app)?;
    let cp = checkpoint::load(&dir, &job_id)?;
    let control = Arc::new(JobControl::new());
    state.jobs.lock().unwrap().insert(job_id.clone(), control.clone());

    let job = CrackJob {
        id: cp.job_id,
        archive: cp.archive,
        entry: cp.entry,
        attack: cp.attack,
        threads: cp.threads,
        checkpoint_dir: dir,
        start_position: cp.position,
        start_tried: cp.tried,
    };
    spawn_job(job, control, on_progress, state.jobs.clone());
    Ok(())
}

#[tauri::command]
pub fn pause_job(job_id: String, state: State<AppState>) -> AppResult<()> {
    if let Some(control) = state.jobs.lock().unwrap().get(&job_id) {
        control.request_pause();
    }
    Ok(())
}

#[tauri::command]
pub fn cancel_job(job_id: String, state: State<AppState>) -> AppResult<()> {
    if let Some(control) = state.jobs.lock().unwrap().get(&job_id) {
        control.request_cancel();
    }
    Ok(())
}

#[tauri::command]
pub fn list_checkpoints(app: AppHandle) -> AppResult<Vec<CheckpointMeta>> {
    Ok(checkpoint::list(&checkpoint_dir(&app)?))
}


#[tauri::command]
pub fn delete_checkpoint(app: AppHandle, job_id: String, state: State<AppState>) -> AppResult<()> {
    if let Some(control) = state.jobs.lock().unwrap().get(&job_id) {
        control.request_cancel();
    }
    checkpoint::delete(&checkpoint_dir(&app)?, &job_id);
    Ok(())
}


#[tauri::command]
pub fn clear_checkpoints(app: AppHandle) -> AppResult<usize> {
    Ok(checkpoint::clear(&checkpoint_dir(&app)?))
}
