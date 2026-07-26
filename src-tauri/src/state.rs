

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::job::control::JobControl;

#[derive(Default)]
pub struct AppState {
    pub jobs: Arc<Mutex<HashMap<String, Arc<JobControl>>>>,
}
