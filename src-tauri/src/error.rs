

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("I/O error: {0}")]
    Io(String),

    #[error("ZIP error: {0}")]
    Zip(String),

    #[error("7z error: {0}")]
    SevenZ(String),

    #[error("RAR error: {0}")]
    Rar(String),


    #[error("{0}")]
    Invalid(String),
}

impl AppError {
    pub fn invalid(msg: impl Into<String>) -> Self {
        AppError::Invalid(msg.into())
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl From<zip::result::ZipError> for AppError {
    fn from(e: zip::result::ZipError) -> Self {
        AppError::Zip(e.to_string())
    }
}

impl From<sevenz_rust2::Error> for AppError {
    fn from(e: sevenz_rust2::Error) -> Self {
        AppError::SevenZ(e.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
