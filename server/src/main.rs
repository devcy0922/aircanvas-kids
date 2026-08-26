//! AirCanvas Kids 릴레이 서버
//!
//! 폰(손 좌표 송신)과 TV(렌더링) 사이의 WebSocket 세션을 방 코드로 매칭하고,
//! 폰 메시지를 같은 방의 TV로 그대로 중계한다. 영상은 취급하지 않는다.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, Query, State};
use axum::http::{header, StatusCode};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, Mutex};

/// 방 코드 → 방 상태. 서버는 이것 외에 어떤 상태도 갖지 않는다.
type Rooms = Arc<Mutex<HashMap<String, RoomState>>>;

#[derive(Clone)]
struct Participant {
    display_name: String,
    tx: mpsc::UnboundedSender<Message>,
    ip: String,
    connected_at: u64,
}

#[derive(Clone, Default)]
struct RoomState {
    tv: Option<Participant>,
    phones: Vec<Participant>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Role {
    Tv,
    Phone,
}

impl Role {
    fn as_str(self) -> &'static str {
        match self {
            Role::Tv => "tv",
            Role::Phone => "phone",
        }
    }
}

#[derive(Deserialize)]
struct WsQuery {
    role: String,
    room: String,
    #[serde(default)]
    name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TvCapabilities {
    max_resolution: Resolution,
    #[serde(rename = "supportsWebGL2")]
    supports_web_gl2: bool,
    #[serde(rename = "supportsWASMSIMD")]
    supports_wasm_simd: bool,
    pixi_version: String,
}

#[derive(Serialize)]
struct Resolution {
    width: u32,
    height: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TvAnnouncement {
    #[serde(rename = "type")]
    msg_type: String,
    room_code: String,
    tv_name: String,
    tv_id: String,
    ws_url: String,
    http_url: String,
    capabilities: TvCapabilities,
    timestamp: u64,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let rooms: Rooms = Arc::new(Mutex::new(HashMap::new()));

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/health", get(health_handler))
        .route("/announce", get(announce_handler))
        .with_state(rooms);

    let addr = std::env::var("HT_BIND").unwrap_or_else(|_| "0.0.0.0:7180".into());
    let listener = tokio::net::TcpListener::bind(&addr).await.expect("bind 실패");
    tracing::info!("AirCanvas 릴레이 서버 시작: http://{addr}");
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await.expect("서버 오류");
}

async fn health_handler(State(rooms): State<Rooms>) -> impl IntoResponse {
    let count = rooms.lock().await.len();
    (
        StatusCode::OK,
        [(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")],
        format!("ok, rooms={count}"),
    )
}

async fn announce_handler(
    headers: axum::http::HeaderMap,
    State(rooms): State<Rooms>,
) -> impl IntoResponse {
    let hostname = headers
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("localhost:7180");

    let map = rooms.lock().await;
    let mut announcements = Vec::new();

    for (room_code, state) in map.iter() {
        if let Some(tv) = &state.tv {
            announcements.push(TvAnnouncement {
                msg_type: "tv-announce".to_string(),
                room_code: room_code.clone(),
                tv_name: tv.display_name.clone(),
                tv_id: format!("tv-{}", room_code),
                ws_url: format!("ws://{}/ws?role=phone&room={}", hostname, room_code),
                http_url: format!("http://{}", hostname),
                capabilities: TvCapabilities {
                    max_resolution: Resolution { width: 1920, height: 1080 },
                    supports_web_gl2: true,
                    supports_wasm_simd: false,
                    pixi_version: "8.6.6".to_string(),
                },
                timestamp: tv.connected_at,
            });
        }
    }

    (
        StatusCode::OK,
        [
            (header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"),
            (header::CONTENT_TYPE, "application/json"),
        ],
        serde_json::to_string(&announcements).unwrap(),
    )
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Query(q): Query<WsQuery>,
    State(rooms): State<Rooms>,
) -> impl IntoResponse {
    let role = match q.role.as_str() {
        "tv" => Role::Tv,
        "phone" => Role::Phone,
        _ => return StatusCode::BAD_REQUEST.into_response(),
    };
    if q.room.is_empty() || q.room.len() > 8 {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let room_code = q.room.to_uppercase();

    ws.on_upgrade(move |socket| async move {
        handle_socket(socket, rooms, role, room_code, q.name, addr).await;
    })
    .into_response()
}

async fn handle_socket(
    socket: WebSocket,
    rooms: Rooms,
    role: Role,
    room: String,
    name: Option<String>,
    addr: SocketAddr,
) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    // --- 방 가입 ---
    let peers_info = {
        let mut map = rooms.lock().await;
        let state = map.entry(room.clone()).or_default();

        let connected_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        match role {
            Role::Tv => {
                if state.tv.is_some() {
                    let _ = sink
                        .send(Message::Text(err_json("ROLE_CONFLICT", "이 방에는 이미 TV가 있습니다.").into()))
                        .await;
                    return;
                }
                state.tv = Some(Participant {
                    display_name: name.clone().unwrap_or_else(|| "TV".into()),
                    tx: tx.clone(),
                    ip: addr.ip().to_string(),
                    connected_at,
                });
            }
            Role::Phone => {
                let max_phones = std::env::var("HT_MAX_PHONES")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(4);
                if state.phones.len() >= max_phones {
                    let _ = sink
                        .send(Message::Text(err_json("ROOM_FULL", "폰 정원이 초과되었습니다.").into()))
                        .await;
                    return;
                }
                state.phones.push(Participant {
                    display_name: name.unwrap_or_else(|| "Phone".into()),
                    tx: tx.clone(),
                    ip: addr.ip().to_string(),
                    connected_at,
                });
            }
        }

        state.phones.iter().map(|p| p.display_name.clone()).collect::<Vec<_>>()
    };

    tracing::info!("방 {room} 에 {} 접속", role.as_str());

    // welcome 전송 + 기존 참가자에게 peer-joined 통보
    let welcome = serde_json::json!({
        "type": "welcome",
        "room": room,
        "role": role.as_str(),
        "peers": peers_info
    })
    .to_string();
    if sink.send(Message::Text(welcome.into())).await.is_err() {
        return;
    }
    broadcast_to_others(&rooms, &room, &tx, &joined_msg("peer-joined", role)).await;

    // --- 송신 태스크: rx 채널 → 웹소켓 sink ---
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sink.send(msg).await.is_err() {
                break;
            }
        }
        let _ = sink.close().await;
    });

    // --- 수신 루프 ---
    while let Some(Ok(msg)) = stream.next().await {
        match msg {
            Message::Text(text) => relay_text(&rooms, &room, &text).await,
            Message::Ping(p) => {
                let _ = tx.send(Message::Pong(p));
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    // --- 퇴장 처리 ---
    send_task.abort();
    {
        let mut map = rooms.lock().await;
        if let Some(state) = map.get_mut(&room) {
            match role {
                Role::Tv => state.tv = None,
                Role::Phone => state.phones.retain(|p| !p.tx.same_channel(&tx)),
            }
            if state.tv.is_none() && state.phones.is_empty() {
                map.remove(&room);
            }
        }
    }
    broadcast_to_all(&rooms, &room, &left_msg(role)).await;
    tracing::info!("방 {room} 에서 {} 퇴장", role.as_str());
}

/// 폰이 보낸 좌표/제어 프레임을 같은 방의 TV로 중계한다.
async fn relay_text(rooms: &Rooms, room: &str, text: &str) {
    let targets: Vec<mpsc::UnboundedSender<Message>> = {
        let map = rooms.lock().await;
        match map.get(room) {
            Some(st) => st.tv.iter().map(|p| p.tx.clone()).collect(),
            None => vec![],
        }
    };
    for tx in targets {
        let _ = tx.send(Message::Text(text.to_string().into()));
    }
}

fn joined_msg(kind: &str, role: Role) -> String {
    serde_json::json!({ "type": kind, "role": role.as_str() }).to_string()
}

fn left_msg(role: Role) -> String {
    serde_json::json!({ "type": "peer-left", "role": role.as_str() }).to_string()
}

fn err_json(code: &str, message: &str) -> String {
    serde_json::json!({ "type": "error", "code": code, "message": message }).to_string()
}

async fn broadcast_to_others(
    rooms: &Rooms,
    room: &str,
    exclude: &mpsc::UnboundedSender<Message>,
    msg: &str,
) {
    for tx in all_senders(rooms, room).await {
        if !tx.same_channel(exclude) {
            let _ = tx.send(Message::Text(msg.to_string().into()));
        }
    }
}

async fn broadcast_to_all(rooms: &Rooms, room: &str, msg: &str) {
    for tx in all_senders(rooms, room).await {
        let _ = tx.send(Message::Text(msg.to_string().into()));
    }
}

async fn all_senders(rooms: &Rooms, room: &str) -> Vec<mpsc::UnboundedSender<Message>> {
    let map = rooms.lock().await;
    match map.get(room) {
        Some(st) => st
            .tv
            .iter()
            .chain(st.phones.iter())
            .map(|p| p.tx.clone())
            .collect(),
        None => vec![],
    }
}
