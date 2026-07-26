

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use rayon::prelude::*;
use tauri::ipc::Channel;

use super::candidate::CandidateSource;
use super::verifier::PasswordVerifier;
use super::{bruteforce::BruteForce, dictionary::Dictionary, mask::Mask, verifier};
use super::{AttackConfig, ProgressMsg};
use crate::archive::format;
use crate::error::{AppError, AppResult};
use crate::job::checkpoint::{self, Checkpoint};
use crate::job::control::JobControl;
use crate::job::metrics::RateTracker;


pub struct CrackJob {
    pub id: String,
    pub archive: PathBuf,
    pub entry: Option<String>,
    pub attack: AttackConfig,
    pub threads: Option<usize>,
    pub checkpoint_dir: PathBuf,
    pub start_position: u64,
    pub start_tried: u64,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn build_source(attack: &AttackConfig) -> AppResult<Box<dyn CandidateSource>> {
    Ok(match attack {
        AttackConfig::Dictionary { wordlist } => Box::new(Dictionary::open(wordlist)?),
        AttackConfig::Mask { pattern } => Box::new(Mask::parse(pattern)?),
        AttackConfig::Bruteforce {
            charset,
            min_len,
            max_len,
        } => Box::new(BruteForce::new(charset, *min_len, *max_len)?),
    })
}


pub fn preview(attack: &AttackConfig, n: usize) -> AppResult<(Option<u64>, Vec<String>)> {
    let mut source = build_source(attack)?;
    let total = source.total();
    let mut out = Vec::new();
    source.next_batch(n, &mut out);
    Ok((total, out))
}


pub fn run(job: CrackJob, control: Arc<JobControl>, on_progress: Channel<ProgressMsg>) {
    if let Err(e) = run_inner(&job, &control, &on_progress) {
        let _ = on_progress.send(ProgressMsg::Error {
            job_id: job.id.clone(),
            message: e.to_string(),
        });
    }
}

fn run_inner(
    job: &CrackJob,
    control: &JobControl,
    on_progress: &Channel<ProgressMsg>,
) -> AppResult<()> {
    let bytes = Arc::new(std::fs::read(&job.archive)?);
    let fmt = format::sniff(&job.archive, &bytes)
        .ok_or_else(|| AppError::invalid("Unrecognized archive format."))?;
    let verifier: Arc<dyn PasswordVerifier> =
        Arc::from(verifier::build_verifier(bytes.clone(), fmt, job.entry.as_deref())?);

    let mut source = build_source(&job.attack)?;
    source.seek(job.start_position);
    let total = source.total();

    let threads = job
        .threads
        .unwrap_or_else(|| num_cpus::get().saturating_sub(1))
        .max(1);
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(threads)
        .build()
        .map_err(|e| AppError::invalid(e.to_string()))?;

    let mut tried = job.start_tried;
    let tracker = RateTracker::new(tried);
    let mut batch = 256usize;
    let mut buf: Vec<String> = Vec::with_capacity(batch);
    let mut last_emit = Instant::now();
    let mut last_ckpt = Instant::now();

    loop {
        if control.is_cancelled() {
            checkpoint::delete(&job.checkpoint_dir, &job.id);
            return Ok(());
        }
        if control.is_paused() {
            let path = save_checkpoint(job, source.position(), tried)?;
            let _ = on_progress.send(ProgressMsg::Paused {
                job_id: job.id.clone(),
                checkpoint: path.to_string_lossy().to_string(),
            });
            return Ok(());
        }

        buf.clear();
        let batch_start = Instant::now();
        let produced = source.next_batch(batch, &mut buf);
        if produced == 0 {
            checkpoint::delete(&job.checkpoint_dir, &job.id);
            let _ = on_progress.send(ProgressMsg::Exhausted {
                job_id: job.id.clone(),
            });
            return Ok(());
        }

        let v = verifier.clone();
        let found: Option<String> =
            pool.install(|| buf.par_iter().find_any(|pw| v.verify(pw.as_str())).map(|s| s.clone()));

        tried += produced as u64;

        if let Some(password) = found {
            checkpoint::delete(&job.checkpoint_dir, &job.id);
            let _ = on_progress.send(ProgressMsg::Found {
                job_id: job.id.clone(),
                password,
            });
            return Ok(());
        }


        let batch_elapsed = batch_start.elapsed().as_secs_f64();
        if batch_elapsed > 0.0 {
            let scale = 0.15 / batch_elapsed;
            batch = ((batch as f64 * scale).clamp(32.0, 200_000.0)) as usize;
        }

        if last_emit.elapsed() >= Duration::from_millis(150) {

            emit_progress(job, on_progress, &tracker, tried, total, buf.last().cloned());
            last_emit = Instant::now();
        }


        if last_ckpt.elapsed() >= Duration::from_secs(5) {
            let _ = save_checkpoint(job, source.position(), tried);
            last_ckpt = Instant::now();
        }
    }
}

fn save_checkpoint(job: &CrackJob, position: u64, tried: u64) -> AppResult<PathBuf> {
    let cp = Checkpoint {
        job_id: job.id.clone(),
        archive: job.archive.clone(),
        entry: job.entry.clone(),
        attack: job.attack.clone(),
        threads: job.threads,
        position,
        tried,
        created_at: now_ms(),
    };
    checkpoint::save(&job.checkpoint_dir, &cp)
}

fn emit_progress(
    job: &CrackJob,
    on_progress: &Channel<ProgressMsg>,
    tracker: &RateTracker,
    tried: u64,
    total: Option<u64>,
    current: Option<String>,
) {
    let per_sec = tracker.avg_rate(tried);
    let percent = total.map(|t| if t > 0 { (tried as f64 / t as f64) * 100.0 } else { 100.0 });
    let eta_ms = match total {
        Some(t) if per_sec > 0.0 && t >= tried => Some((((t - tried) as f64 / per_sec) * 1000.0) as u64),
        _ => None,
    };
    let _ = on_progress.send(ProgressMsg::Progress {
        job_id: job.id.clone(),
        tried,
        total,
        per_sec,
        percent,
        elapsed_ms: tracker.elapsed_ms(),
        eta_ms,
        current,
    });
}
