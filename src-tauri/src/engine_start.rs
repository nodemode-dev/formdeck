use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const APP: &str = "formdeck";
pub const SHELL_ENV: &str = "FORMDECK_SHELL_PID";
pub const ADDRESS_WAIT: Duration = Duration::from_secs(90);
pub const KEY_WAIT: Duration = Duration::from_secs(10);
pub const EXIT_WAIT: Duration = Duration::from_secs(1);
pub const BUSY_CODE: i32 = 2;
const DATA_ENVS: [&str; 2] = ["FORMDECK_DATA_DIR", "FORMSLD_DATA_DIR"];
const HOME_NAME: &str = "formdeck";
const OLD_NAMES: [&str; 2] = ["FormDeck", "Formsld"];
const LOG_FOLDER: &str = "Logs";
const LOG_NAME: &str = "formdeck-engine.log";
const KEY_MARK: &str = "window-key";
const TAIL_LINES: usize = 12;
const LINE_CHARS: usize = 300;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Wait {
    Address,
    Key,
}

impl Wait {
    pub fn limit(self) -> Duration {
        match self {
            Wait::Address => ADDRESS_WAIT,
            Wait::Key => KEY_WAIT,
        }
    }

    pub fn what(self) -> &'static str {
        match self {
            Wait::Address => "its engine to say which address it serves on",
            Wait::Key => "its engine to hand over the key for the window",
        }
    }
}

#[derive(Debug, PartialEq)]
pub enum Failure {
    Missing,
    NotStarted(String),
    Stopped(Option<i32>),
    TimedOut(Wait),
    Window,
}

#[derive(Default)]
pub struct Tail(VecDeque<String>);

impl Tail {
    pub fn push(&mut self, line: &str) {
        if line.contains(KEY_MARK) {
            return;
        }
        let clean: String = line.chars().filter(|c| !c.is_control()).take(LINE_CHARS).collect();
        if clean.trim().is_empty() {
            return;
        }
        if self.0.len() == TAIL_LINES {
            self.0.pop_front();
        }
        self.0.push_back(clean);
    }

    pub fn lines(&self) -> Vec<String> {
        self.0.iter().cloned().collect()
    }
}

pub fn sentence(failure: &Failure) -> String {
    match failure {
        Failure::Missing => format!("{APP} could not start: its engine program is missing from the install. Installing {APP} again puts it back."),
        Failure::NotStarted(reason) => format!("{APP} could not start its engine: {reason}"),
        Failure::Stopped(Some(BUSY_CODE)) => format!("{APP} could not start: another copy of its engine holds its data folder."),
        Failure::Stopped(Some(code)) => format!("{APP} could not start: its engine stopped with code {code} before the window could open."),
        Failure::Stopped(None) => format!("{APP} could not start: its engine stopped before the window could open."),
        Failure::TimedOut(wait) => format!("{APP} could not start: it waited {} seconds for {} and that did not happen.", wait.limit().as_secs(), wait.what()),
        Failure::Window => format!("{APP} could not open its window."),
    }
}

pub fn message(failure: &Failure, tail: &[String], log: Option<&Path>) -> String {
    let mut text = sentence(failure);
    if !tail.is_empty() {
        text.push_str("\n\nThe engine's last lines:\n");
        text.push_str(&tail.join("\n"));
    } else if matches!(failure, Failure::Stopped(_) | Failure::TimedOut(_)) {
        text.push_str("\n\nThe engine wrote nothing before that.");
    }
    if let Some(path) = log {
        text.push_str("\n\nThe engine's log: ");
        text.push_str(&path.to_string_lossy());
    }
    text
}

pub fn home(os: &str, var: &dyn Fn(&str) -> Option<String>) -> Option<PathBuf> {
    let name = if os == "windows" { "USERPROFILE" } else { "HOME" };
    var(name).filter(|value| !value.is_empty()).map(PathBuf::from)
}

pub fn data_folder(var: &dyn Fn(&str) -> Option<String>, home: Option<&Path>, there: &dyn Fn(&Path) -> bool) -> Option<PathBuf> {
    if let Some(raw) = DATA_ENVS.iter().find_map(|name| var(name)).filter(|value| !value.is_empty()) {
        return match (raw.strip_prefix('~'), home) {
            (Some(rest), Some(home)) if rest.is_empty() || rest.starts_with('/') || rest.starts_with('\\') => {
                Some(home.join(rest.trim_start_matches(['/', '\\'])))
            }
            _ => Some(PathBuf::from(raw)),
        };
    }
    let home = home?;
    let current = home.join(HOME_NAME);
    if there(&current) {
        return Some(current);
    }
    Some(OLD_NAMES.iter().map(|name| home.join(name)).find(|old| there(old)).unwrap_or(current))
}

pub fn log_path(os: &str, var: &dyn Fn(&str) -> Option<String>, there: &dyn Fn(&Path) -> bool) -> Option<PathBuf> {
    data_folder(var, home(os, var).as_deref(), there).map(|folder| folder.join(LOG_FOLDER).join(LOG_NAME))
}

pub fn engine_log() -> Option<PathBuf> {
    log_path(std::env::consts::OS, &|name| std::env::var(name).ok(), &|path| path.exists())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars(pairs: &'static [(&'static str, &'static str)]) -> impl Fn(&str) -> Option<String> {
        move |asked| pairs.iter().find(|(name, _)| *name == asked).map(|(_, value)| value.to_string())
    }

    #[test]
    fn the_tail_keeps_the_last_lines_and_never_the_window_key() {
        let mut tail = Tail::default();
        for n in 0..15 {
            tail.push(&format!("line {n}"));
        }
        tail.push("formdeck-window-key: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
        tail.push("   ");
        tail.push(&"x".repeat(1000));
        let lines = tail.lines();
        assert_eq!(lines.len(), TAIL_LINES);
        assert_eq!(lines[0], "line 4");
        assert_eq!(lines[TAIL_LINES - 1].len(), LINE_CHARS);
        assert!(lines.iter().all(|line| !line.contains("window-key")));
    }

    #[test]
    fn every_failure_has_its_sentence_the_last_lines_and_the_log() {
        let log = Path::new("/data/Logs/formdeck-engine.log");
        let said = vec!["formdeck is already running on /data (engine process 7).".to_string()];
        let busy = message(&Failure::Stopped(Some(BUSY_CODE)), &said, Some(log));
        assert!(busy.starts_with("formdeck could not start: another copy of its engine holds its data folder."));
        assert!(busy.contains("The engine's last lines:\nformdeck is already running on /data (engine process 7)."));
        assert!(busy.ends_with("The engine's log: /data/Logs/formdeck-engine.log"));
        assert!(message(&Failure::Stopped(Some(3)), &[], Some(log)).contains("stopped with code 3"));
        assert!(message(&Failure::Stopped(None), &[], None).ends_with("The engine wrote nothing before that."));
        assert!(message(&Failure::Missing, &[], None).ends_with("puts it back."));
        assert!(sentence(&Failure::NotStarted("Access is denied.".to_string())).ends_with("its engine: Access is denied."));
        assert_eq!(sentence(&Failure::Window), "formdeck could not open its window.");
    }

    #[test]
    fn a_wait_that_runs_out_says_how_long_and_for_what() {
        assert_eq!(ADDRESS_WAIT, Duration::from_secs(90));
        assert!(sentence(&Failure::TimedOut(Wait::Address)).contains("waited 90 seconds for its engine to say which address it serves on"));
        assert!(sentence(&Failure::TimedOut(Wait::Key)).contains("waited 10 seconds for its engine to hand over the key for the window"));
    }

    #[test]
    fn the_log_is_where_the_engine_writes_it() {
        let home = Path::new("/home/u");
        let nothing = |_: &Path| false;
        let tail = Path::new("Logs").join("formdeck-engine.log");
        assert_eq!(log_path("linux", &vars(&[("HOME", "/home/u")]), &nothing), Some(home.join("formdeck").join(&tail)));
        assert_eq!(log_path("macos", &vars(&[("HOME", "/home/u")]), &|path: &Path| path == home.join("formdeck")), Some(home.join("formdeck").join(&tail)));
        assert_eq!(log_path("windows", &vars(&[("USERPROFILE", "/home/u"), ("HOME", "/other")]), &nothing), Some(home.join("formdeck").join(&tail)));
        assert_eq!(log_path("linux", &vars(&[("HOME", "/home/u")]), &|path: &Path| path == home.join("FormDeck")), Some(home.join("FormDeck").join(&tail)));
        assert_eq!(log_path("linux", &vars(&[("HOME", "/home/u")]), &|path: &Path| path == home.join("Formsld")), Some(home.join("Formsld").join(&tail)));
        assert_eq!(log_path("linux", &vars(&[("HOME", "/home/u")]), &|_: &Path| true), Some(home.join("formdeck").join(&tail)));
        assert_eq!(log_path("linux", &vars(&[("HOME", "/home/u"), ("FORMDECK_DATA_DIR", "/d/x")]), &nothing), Some(Path::new("/d/x").join(&tail)));
        assert_eq!(log_path("linux", &vars(&[("HOME", "/home/u"), ("FORMSLD_DATA_DIR", "/d/old")]), &nothing), Some(Path::new("/d/old").join(&tail)));
        assert_eq!(log_path("linux", &vars(&[("FORMDECK_DATA_DIR", "/d/x"), ("FORMSLD_DATA_DIR", "/d/old")]), &nothing), Some(Path::new("/d/x").join(&tail)));
        assert_eq!(log_path("linux", &vars(&[("HOME", "/home/u"), ("FORMDECK_DATA_DIR", "~/x")]), &nothing), Some(home.join("x").join(&tail)));
        assert_eq!(log_path("linux", &vars(&[("HOME", "/home/u"), ("FORMDECK_DATA_DIR", "~")]), &nothing), Some(home.join(&tail)));
        assert_eq!(log_path("linux", &vars(&[("HOME", "/home/u"), ("FORMDECK_DATA_DIR", "")]), &nothing), Some(home.join("formdeck").join(&tail)));
        assert_eq!(log_path("linux", &vars(&[]), &nothing), None);
        assert_eq!(log_path("windows", &vars(&[("HOME", "/home/u")]), &nothing), None);
    }
}
