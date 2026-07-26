

pub mod bruteforce;
pub mod candidate;
pub mod charset;
pub mod dictionary;
pub mod engine;
pub mod mask;
pub mod verifier;

use std::path::PathBuf;

use serde::{Deserialize, Serialize};


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum AttackConfig {
    Dictionary {
        wordlist: PathBuf,
    },
    Mask {
        pattern: String,
    },
    #[serde(rename_all = "camelCase")]
    Bruteforce {
        charset: String,
        min_len: usize,
        max_len: usize,
    },
}


#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrackConfig {
    pub archive: PathBuf,

    pub entry: Option<String>,
    pub attack: AttackConfig,

    pub threads: Option<usize>,
}


#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ProgressMsg {
    Progress {
        job_id: String,
        tried: u64,
        total: Option<u64>,
        per_sec: f64,
        percent: Option<f64>,
        elapsed_ms: u64,
        eta_ms: Option<u64>,


        current: Option<String>,
    },
    Found {
        job_id: String,
        password: String,
    },
    Exhausted {
        job_id: String,
    },
    Paused {
        job_id: String,
        checkpoint: String,
    },
    Error {
        job_id: String,
        message: String,
    },
}

#[cfg(test)]
mod wire_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn progress_msg_wire_shape() {
        let msg = ProgressMsg::Progress {
            job_id: "job-1".into(),
            tried: 10,
            total: Some(100),
            per_sec: 5.0,
            percent: Some(10.0),
            elapsed_ms: 2000,
            eta_ms: Some(18000),
            current: Some("abc123".into()),
        };
        let v = serde_json::to_value(&msg).unwrap();

        assert_eq!(v["event"], "progress");
        assert_eq!(v["jobId"], "job-1");
        assert_eq!(v["perSec"], 5.0);
        assert_eq!(v["elapsedMs"], 2000);
        assert_eq!(v["etaMs"], 18000);
        assert_eq!(v["current"], "abc123");
    }

    #[test]
    fn found_msg_wire_shape() {
        let v = serde_json::to_value(ProgressMsg::Found {
            job_id: "j".into(),
            password: "pw".into(),
        })
        .unwrap();
        assert_eq!(v, json!({ "event": "found", "jobId": "j", "password": "pw" }));
    }

    #[test]
    fn attack_config_wire_shapes() {
        let bf = serde_json::to_value(AttackConfig::Bruteforce {
            charset: "ab".into(),
            min_len: 1,
            max_len: 4,
        })
        .unwrap();
        assert_eq!(
            bf,
            json!({ "kind": "bruteforce", "charset": "ab", "minLen": 1, "maxLen": 4 })
        );

        let dict: AttackConfig =
            serde_json::from_value(json!({ "kind": "dictionary", "wordlist": "/tmp/w.txt" }))
                .unwrap();
        assert!(matches!(dict, AttackConfig::Dictionary { .. }));

        let mask: AttackConfig =
            serde_json::from_value(json!({ "kind": "mask", "pattern": "?l?d" })).unwrap();
        assert!(matches!(mask, AttackConfig::Mask { .. }));
    }
}
