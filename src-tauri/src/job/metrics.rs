

use std::time::Instant;

pub struct RateTracker {
    start: Instant,
    start_count: u64,
}

impl RateTracker {
    pub fn new(start_count: u64) -> Self {
        Self {
            start: Instant::now(),
            start_count,
        }
    }

    pub fn elapsed_ms(&self) -> u64 {
        self.start.elapsed().as_millis() as u64
    }


    pub fn avg_rate(&self, count: u64) -> f64 {
        let secs = self.start.elapsed().as_secs_f64();
        if secs > 0.0 {
            (count.saturating_sub(self.start_count)) as f64 / secs
        } else {
            0.0
        }
    }
}
