#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod reveal;

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use tauri::{Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::UpdaterExt;

struct Backend(Mutex<Option<CommandChild>>);
struct Pending(Mutex<Vec<String>>);

const FALLBACK_LOGICAL: (f64, f64) = (1323.0, 860.0);
const MIN_LOGICAL: (f64, f64) = (980.0, 640.0);
const SCREEN_FRACTION: f64 = 0.9;
const PRESENTER_LOGICAL: (f64, f64) = (1100.0, 700.0);
const CASCADE_LOGICAL: f64 = 28.0;
static NEXT_WINDOW: AtomicUsize = AtomicUsize::new(1);

fn kill_backend(handle: &tauri::AppHandle) {
    if let Some(child) = handle.state::<Backend>().0.lock().unwrap().take() {
        let _ = child.kill();
    }
}

fn close_splash(handle: &tauri::AppHandle) {
    if let Some(splash) = handle.get_webview_window("splash") {
        let _ = splash.close();
    }
}

fn openable(path: &std::path::Path) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "fdec" | "fsld" | "pptx" | "potx" | "ppsx" | "pptm" | "odp" | "otp"))
            .unwrap_or(false)
}

fn deck_window(handle: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    handle.get_webview_window("main").or_else(|| {
        let mut decks: Vec<(usize, tauri::WebviewWindow)> = handle
            .webview_windows()
            .into_iter()
            .filter_map(|(label, window)| label.strip_prefix("deck-").and_then(|n| n.parse().ok()).map(|n| (n, window)))
            .collect();
        decks.sort_by_key(|(n, _)| *n);
        match decks.iter().position(|(_, window)| window.is_focused().unwrap_or(false)) {
            Some(at) => Some(decks.swap_remove(at).1),
            None => decks.pop().map(|(_, window)| window),
        }
    })
}

fn hand_over(handle: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    match deck_window(handle) {
        Some(window) => {
            let list = serde_json::to_string(&paths).unwrap_or_else(|_| "[]".into());
            let _ = window.eval(&format!(
                "(function f(n){{if(window.__formdeckOpen)window.__formdeckOpen({list});else if(n<60)setTimeout(function(){{f(n+1)}},250)}})(0)"
            ));
            let _ = window.set_focus();
        }
        None => handle.state::<Pending>().0.lock().unwrap().extend(paths),
    }
}

fn check_for_updates(handle: tauri::AppHandle) {
    let configured = handle
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|updater| updater.get("pubkey"))
        .and_then(|key| key.as_str())
        .map_or(false, |key| !key.is_empty());
    if !configured {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let Ok(updater) = handle.updater() else { return };
        let Ok(Some(update)) = updater.check().await else { return };
        let install = handle
            .dialog()
            .message(format!("formdeck {} is available. Install it and restart?", update.version))
            .title("Update available")
            .buttons(MessageDialogButtons::OkCancel)
            .blocking_show();
        if install && update.download_and_install(|_, _| {}, || {}).await.is_ok() {
            kill_backend(&handle);
            handle.restart();
        }
    });
}

fn loopback_url(raw: &str) -> Result<tauri::Url, String> {
    let url: tauri::Url = raw.parse().map_err(|_| format!("not a URL: {raw}"))?;
    let loopback = matches!(url.host_str(), Some("127.0.0.1") | Some("localhost"));
    if url.scheme() == "http" && loopback {
        Ok(url)
    } else {
        Err(format!("not a loopback URL: {raw}"))
    }
}

#[tauri::command]
fn system_fonts() -> Vec<String> {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();
    let mut names: Vec<String> = db
        .faces()
        .flat_map(|face| face.families.iter().map(|(name, _)| name.trim().to_string()))
        .filter(|name| !name.is_empty() && !name.starts_with('.'))
        .collect();
    names.sort_by_key(|name| name.to_lowercase());
    names.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    names
}

#[tauri::command]
async fn open_window(app: tauri::AppHandle, window: tauri::WebviewWindow, url: String) -> Result<(), String> {
    let target = loopback_url(&url)?;
    let label = format!("deck-{}", NEXT_WINDOW.fetch_add(1, Ordering::SeqCst));
    let scale = window.scale_factor().unwrap_or(1.0);
    let (width, height) = window
        .inner_size()
        .map(|size| (size.width as f64 / scale, size.height as f64 / scale))
        .unwrap_or(FALLBACK_LOGICAL);
    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(target))
        .title("formdeck")
        .inner_size(width, height)
        .min_inner_size(MIN_LOGICAL.0, MIN_LOGICAL.1)
        .accept_first_mouse(true)
        .visible(reveal::BUILD_VISIBLE)
        .background_color(reveal::BACKGROUND);
    if let Ok(at) = window.outer_position() {
        builder = builder.position(at.x as f64 / scale + CASCADE_LOGICAL, at.y as f64 / scale + CASCADE_LOGICAL);
    }
    let built = builder.build().map_err(|e| e.to_string())?;
    reveal::conceal_extra(&built);
    Ok(())
}

#[tauri::command]
async fn open_presenter(app: tauri::AppHandle, window: tauri::WebviewWindow, url: String) -> Result<(), String> {
    let target = loopback_url(&url)?;
    let other = other_monitor(&app, &window);
    let label = format!("presenter-{}", window.label());
    if let Some(existing) = app.get_webview_window(&label) {
        existing.navigate(target).map_err(|e| e.to_string())?;
        if let Some(m) = &other {
            existing.set_position(tauri::Position::Physical(*m.position())).map_err(|e| e.to_string())?;
            existing.set_fullscreen(true).map_err(|e| e.to_string())?;
        }
        return existing.set_focus().map_err(|e| e.to_string());
    }
    let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(target)).title("formdeck slide show");
    let builder = match &other {
        Some(m) => {
            let scale = m.scale_factor();
            let at = m.position();
            builder.position(at.x as f64 / scale, at.y as f64 / scale).fullscreen(true)
        }
        None => builder.inner_size(PRESENTER_LOGICAL.0, PRESENTER_LOGICAL.1).center(),
    };
    builder.build().map(|_| ()).map_err(|e| e.to_string())
}

fn other_monitor(app: &tauri::AppHandle, from: &tauri::WebviewWindow) -> Option<tauri::Monitor> {
    let here = from.current_monitor().ok().flatten()?;
    app.available_monitors().ok()?.into_iter().find(|m| m.position() != here.position())
}

#[tauri::command]
fn monitor_count(app: tauri::AppHandle) -> usize {
    app.available_monitors().map(|m| m.len()).unwrap_or(0)
}

#[tauri::command]
async fn swap_presenter(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    let owner = window.label().strip_prefix("presenter-").map(str::to_string);
    let main = match owner {
        Some(owner) => app.get_webview_window(&owner).ok_or("no window for this slide show")?,
        None => window,
    };
    let show = app.get_webview_window(&format!("presenter-{}", main.label())).ok_or("no slide show window")?;
    let main_at = main.current_monitor().map_err(|e| e.to_string())?.ok_or("no monitor")?;
    let show_at = show.current_monitor().map_err(|e| e.to_string())?.ok_or("no monitor")?;
    if main_at.position() == show_at.position() {
        return Ok(());
    }
    for (window, monitor) in [(&main, &show_at), (&show, &main_at)] {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
        window.set_position(tauri::Position::Physical(*monitor.position())).map_err(|e| e.to_string())?;
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn print_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("no window labeled {label}"))?;
    window.print().map_err(|e| e.to_string())
}

fn main() {
    reveal::mark_launch();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let paths = argv
                .into_iter()
                .skip(1)
                .map(|arg| {
                    let path = std::path::PathBuf::from(&arg);
                    if path.is_absolute() { path } else { std::path::Path::new(&cwd).join(path) }
                })
                .filter(|path| openable(path))
                .map(|path| path.to_string_lossy().into_owned())
                .collect();
            hand_over(app, paths);
            if let Some(window) = deck_window(app) {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![system_fonts, open_window, open_presenter, print_window, monitor_count, swap_presenter, reveal::app_ready])
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let _ = window.app_handle().emit("formdeck://window-closed", window.label());
            }
        })
        .manage(Backend(Mutex::new(None)))
        .manage(Pending(Mutex::new(Vec::new())))
        .setup(|app| {
            let handle = app.handle().clone();
            reveal::round_splash(&handle);
            let (mut rx, child) = app
                .shell()
                .sidecar("formdeck-engine")
                .expect("sidecar binary is bundled")
                .env("FORMDECK_PORT", "0")
                .env("FORMDECK_PORT_PREFER", "8297")
                .spawn()
                .expect("the formdeck engine failed to spawn");
            app.state::<Backend>().0.lock().unwrap().replace(child);
            let from_args: Vec<String> = std::env::args()
                .skip(1)
                .map(std::path::PathBuf::from)
                .filter(|path| openable(path))
                .map(|path| path.to_string_lossy().into_owned())
                .collect();
            app.state::<Pending>().0.lock().unwrap().extend(from_args);

            tauri::async_runtime::spawn(async move {
                let pattern = regex::Regex::new(r"http://127\.0\.0\.1:(\d+)").unwrap();
                let mut port: Option<u16> = None;
                while let Some(event) = rx.recv().await {
                    let line = match event {
                        CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                            String::from_utf8_lossy(&bytes).into_owned()
                        }
                        CommandEvent::Terminated(_) => break,
                        _ => continue,
                    };
                    if let Some(captures) = pattern.captures(&line) {
                        port = captures[1].parse().ok();
                        if port.is_some() {
                            break;
                        }
                    }
                }
                match port {
                    Some(found) => {
                        let mut url: tauri::Url = format!("http://127.0.0.1:{found}")
                            .parse()
                            .expect("loopback url");
                        let waiting: Vec<String> = handle.state::<Pending>().0.lock().unwrap().drain(..).collect();
                        if !waiting.is_empty() {
                            let mut query = url.query_pairs_mut();
                            for path in &waiting {
                                query.append_pair("open", path);
                            }
                        }
                        let (width, height) = handle
                            .primary_monitor()
                            .ok()
                            .flatten()
                            .map(|monitor| {
                                let size = monitor.size();
                                let scale = monitor.scale_factor();
                                (
                                    (size.width as f64 / scale) * SCREEN_FRACTION,
                                    (size.height as f64 / scale) * SCREEN_FRACTION,
                                )
                            })
                            .unwrap_or(FALLBACK_LOGICAL);
                        if let Ok(main) = WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(url))
                            .title("formdeck")
                            .inner_size(width, height)
                            .min_inner_size(MIN_LOGICAL.0, MIN_LOGICAL.1)
                            .center()
                            .accept_first_mouse(true)
                            .visible(reveal::BUILD_VISIBLE)
                            .background_color(reveal::BACKGROUND)
                            .build()
                        {
                            reveal::conceal(&main);
                            let focus = main.clone();
                            main.on_window_event(move |event| {
                                if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { .. }) = event {
                                    let _ = focus.set_focus();
                                }
                            });
                        } else {
                            close_splash(&handle);
                        }
                        check_for_updates(handle.clone());
                    }
                    None => {
                        close_splash(&handle);
                        handle
                            .dialog()
                            .message("The formdeck engine failed to start. Please relaunch the app.")
                            .blocking_show();
                        kill_backend(&handle);
                        std::process::exit(1);
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("tauri app should build");

    app.run(|handle, event| match event {
        RunEvent::Exit => kill_backend(handle),
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        RunEvent::Opened { urls } => {
            let paths = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .filter(|path| openable(path))
                .map(|path| path.to_string_lossy().into_owned())
                .collect();
            hand_over(handle, paths);
        }
        _ => {}
    });
}
