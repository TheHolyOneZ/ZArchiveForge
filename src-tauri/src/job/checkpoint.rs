

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::crack::AttackConfig;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint {
    pub job_id: String,
    pub archive: PathBuf,
    pub entry: Option<String>,
    pub attack: AttackConfig,
    pub threads: Option<usize>,

    pub position: u64,
    pub tried: u64,

    pub created_at: u64,
}


#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointMeta {
    pub job_id: String,
    pub archive: PathBuf,
    pub attack: AttackConfig,
    pub tried: u64,
    pub created_at: u64,
}

fn jobs_dir(base: &Path) -> PathBuf {
    base.join("jobs")
}

fn job_path(base: &Path, job_id: &str) -> PathBuf {
    jobs_dir(base).join(format!("{job_id}.json"))
}

pub fn save(base: &Path, cp: &Checkpoint) -> AppResult<PathBuf> {
    let dir = jobs_dir(base);
    std::fs::create_dir_all(&dir)?;
    let path = job_path(base, &cp.job_id);
    let json = serde_json::to_string_pretty(cp).map_err(|e| AppError::invalid(e.to_string()))?;
    std::fs::write(&path, json)?;
    Ok(path)
}

pub fn load(base: &Path, job_id: &str) -> AppResult<Checkpoint> {
    let data = std::fs::read_to_string(job_path(base, job_id))?;
    serde_json::from_str(&data).map_err(|e| AppError::invalid(e.to_string()))
}

pub fn delete(base: &Path, job_id: &str) {
    let _ = std::fs::remove_file(job_path(base, job_id));
}


pub fn clear(base: &Path) -> usize {
    let mut n = 0;
    if let Ok(rd) = std::fs::read_dir(jobs_dir(base)) {
        for e in rd.flatten() {
            if e.path().extension().and_then(|s| s.to_str()) == Some("json")
                && std::fs::remove_file(e.path()).is_ok()
            {
                n += 1;
            }
        }
    }
    n
}

pub fn list(base: &Path) -> Vec<CheckpointMeta> {
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(jobs_dir(base)) {
        for e in rd.flatten() {
            if e.path().extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            if let Ok(data) = std::fs::read_to_string(e.path()) {
                if let Ok(cp) = serde_json::from_str::<Checkpoint>(&data) {
                    out.push(CheckpointMeta {
                        job_id: cp.job_id,
                        archive: cp.archive,
                        attack: cp.attack,
                        tried: cp.tried,
                        created_at: cp.created_at,
                    });
                }
            }
        }
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    out
}
