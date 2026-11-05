//! The login: every request needs voxl's password, except the scripts and assets the page
//! loads before it can present one and the health check. A browser signs in at its own
//! prompt (HTTP Basic, with any user name unless --basic-auth-user names one) or opens a
//! link with the password in `?token=`, which the page passes on to its socket and its
//! file requests. Programs send `Authorization: Bearer <password>` or Basic credentials
//! (`curl -u :<password>`).

use axum::extract::{Query, Request, State};
use axum::http::{header, HeaderMap, StatusCode, Uri};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use base64::Engine;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const SESSION_SECONDS: u64 = 7 * 24 * 60 * 60;
const SESSION_COOKIE: &str = "voxl_session";
const MAX_SESSIONS: usize = 4096;

/// Opaque capability for the authenticated page's socket and file requests. This
/// also works in embedded Safari contexts where third-party cookies are blocked.
#[derive(Clone)]
pub struct PageSession(pub String);

/// What the page fetches before it has the password, and the health check.
const PUBLIC: &[&str] = &[
    "/client.js",
    "/worker.js",
    "/audio.js",
    "/mic.js",
    "/favicon.ico",
    "/inter.woff2",
    "/manifest.webmanifest",
    "/sw.js",
    "/icon-192.png",
    "/icon-512.png",
    "/apple-touch-icon.png",
    "/healthz",
];

pub struct Login {
    /// The user name Basic credentials have to carry; any name when `None`.
    user: Option<String>,
    password: String,
    sessions: Mutex<HashMap<String, Instant>>,
}

impl Login {
    pub fn new(user: Option<String>, password: String) -> Self {
        Login { user, password, sessions: Mutex::new(HashMap::new()) }
    }

    /// From --enable-basic-auth (on unless false), --basic-auth-user and the password:
    /// --basic-auth-password, else VOXL_PASSWORD or SELKIES_BASIC_AUTH_PASSWORD, else a
    /// random one. `None` with the login off; the flag says whether the password was made
    /// up here, so the only way to learn it is the link voxl prints.
    pub fn from_args(a: &HashMap<String, String>) -> Option<(Self, bool)> {
        if !crate::truthy(a.get("enable-basic-auth"), true) {
            return None;
        }
        let given = a
            .get("basic-auth-password")
            .cloned()
            .or_else(|| std::env::var("VOXL_PASSWORD").ok())
            .or_else(|| std::env::var("SELKIES_BASIC_AUTH_PASSWORD").ok())
            .filter(|p| !p.is_empty());
        let generated = given.is_none();
        let password = given.unwrap_or_else(random_password);
        let user = a.get("basic-auth-user").filter(|u| !u.is_empty()).cloned();
        Some((Login::new(user, password), generated))
    }

    pub fn password(&self) -> &str {
        &self.password
    }

    /// Whether a request to `uri` with these headers may go through.
    fn admits(&self, uri: &Uri, headers: &HeaderMap) -> bool {
        if PUBLIC.contains(&uri.path()) {
            return true;
        }
        if self.session_from(uri, headers).is_some() {
            return true;
        }
        let authorization = headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.trim().split_once(' '));
        if let Some((scheme, credentials)) = authorization {
            let credentials = credentials.trim();
            if scheme.eq_ignore_ascii_case("bearer") && same(credentials, &self.password) {
                return true;
            }
            if scheme.eq_ignore_ascii_case("basic") && self.basic(credentials) {
                return true;
            }
        }
        Query::<HashMap<String, String>>::try_from_uri(uri)
            .ok()
            .and_then(|q| q.0.get("token").map(|t| same(t, &self.password)))
            .unwrap_or(false)
    }

    fn session_from(&self, uri: &Uri, headers: &HeaderMap) -> Option<String> {
        let query = Query::<HashMap<String, String>>::try_from_uri(uri).ok()
            .and_then(|q| q.0.get("session").cloned());
        let cookies = headers.get_all(header::COOKIE).iter()
            .filter_map(|h| h.to_str().ok())
            .flat_map(|h| h.split(';'))
            .filter_map(|c| c.trim().split_once('='))
            .filter(|(name, _)| *name == SESSION_COOKIE)
            .map(|(_, value)| value.to_string());
        let now = Instant::now();
        let sessions = self.sessions.lock().unwrap();
        query.into_iter().chain(cookies).find(|token|
            sessions.get(token).is_some_and(|expiry| *expiry > now))
    }

    fn new_session(&self) -> String {
        // Random bearer capability, not the password. Kept only in server memory;
        // restarting the server revokes all sessions rather than persisting secrets.
        let token = format!("{}{}", random_password(), random_password());
        let now = Instant::now();
        let mut sessions = self.sessions.lock().unwrap();
        sessions.retain(|_, expiry| *expiry > now);
        if sessions.len() >= MAX_SESSIONS {
            if let Some(oldest) = sessions.iter().min_by_key(|(_, expiry)| *expiry).map(|(key, _)| key.clone()) {
                sessions.remove(&oldest);
            }
        }
        sessions.insert(token.clone(), now + Duration::from_secs(SESSION_SECONDS));
        token
    }

    /// Basic credentials (`user:password` in base64) with the password and, if one is
    /// set, the user name.
    fn basic(&self, encoded: &str) -> bool {
        let Some(decoded) = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .ok()
            .and_then(|b| String::from_utf8(b).ok())
        else {
            return false;
        };
        let Some((user, password)) = decoded.split_once(':') else {
            return false;
        };
        let user_ok = self.user.as_deref().is_none_or(|u| same(user, u));
        same(password, &self.password) && user_ok
    }
}

/// Compares in time that depends only on the lengths, not on where the bytes differ.
fn same(a: &str, b: &str) -> bool {
    a.len() == b.len()
        && a.bytes()
            .zip(b.bytes())
            .fold(0, |diff, (x, y)| diff | (x ^ y))
            == 0
}

/// 128 random bits as 32 hex digits.
fn random_password() -> String {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).expect("random password");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Middleware for every route: answers 401 with a Basic challenge, so a browser asks
/// for the password, instead of running the handler for a request without it.
pub async fn check(State(login): State<Arc<Login>>, mut req: Request, next: Next) -> Response {
    if login.admits(req.uri(), req.headers()) {
        if PUBLIC.contains(&req.uri().path()) {
            return next.run(req).await;
        }
        let page = matches!(req.uri().path(), "/" | "/index.html");
        if page {
            let token = login.session_from(req.uri(), req.headers()).unwrap_or_else(|| login.new_session());
            let cookie = session_cookie(&token, req.headers());
            req.extensions_mut().insert(PageSession(token));
            let mut response = next.run(req).await;
            response.headers_mut().insert(header::SET_COOKIE, cookie.parse().unwrap());
            response.headers_mut().insert(header::CACHE_CONTROL, "private, no-store".parse().unwrap());
            response.headers_mut().insert(header::REFERRER_POLICY, "no-referrer".parse().unwrap());
            return response;
        }
        return next.run(req).await;
    }
    // Only a page navigation should open the native login prompt. A failed
    // WebSocket reconnect/file request must not trap mobile Safari in a prompt loop.
    if !matches!(req.uri().path(), "/" | "/index.html") {
        return (StatusCode::UNAUTHORIZED, "Voxl session expired. Reload the stream to sign in.").into_response();
    }
    log::debug!("no password: {} {}", req.method(), req.uri().path());
    (
        StatusCode::UNAUTHORIZED,
        [(
            header::WWW_AUTHENTICATE,
            r#"Basic realm="voxl", charset="UTF-8""#,
        )],
        "voxl needs its password: open the link voxl printed when it started, sign in when \
         the browser asks, or send Authorization: Bearer <password>",
    )
        .into_response()
}

fn session_cookie(token: &str, headers: &HeaderMap) -> String {
    // Secure on non-loopback hosts, and on loopback behind an HTTPS reverse proxy.
    let host = headers.get(header::HOST).and_then(|h| h.to_str().ok()).unwrap_or("");
    let loopback = host == "localhost" || host.starts_with("localhost:") ||
        host == "127.0.0.1" || host.starts_with("127.0.0.1:") || host.starts_with("[::1]");
    let https = headers.get("x-forwarded-proto").and_then(|h| h.to_str().ok())
        .is_some_and(|h| h.split(',').next().unwrap_or("").trim() == "https");
    format!("{SESSION_COOKIE}={token}; Path=/; Max-Age={SESSION_SECONDS}; HttpOnly; SameSite=Lax{}", if !loopback || https { "; Secure" } else { "" })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn admitted(login: &Login, uri: &str, authorization: Option<&str>) -> bool {
        let mut headers = HeaderMap::new();
        if let Some(a) = authorization {
            headers.insert(header::AUTHORIZATION, HeaderValue::from_str(a).unwrap());
        }
        login.admits(&uri.parse().unwrap(), &headers)
    }

    fn basic(user_password: &str) -> String {
        format!(
            "Basic {}",
            base64::engine::general_purpose::STANDARD.encode(user_password)
        )
    }

    /// A login with a password made up at runtime, as voxl makes one, and the password.
    fn with_random_password(user: Option<&str>) -> (Login, String) {
        let password = random_password();
        (
            Login::new(user.map(str::to_string), password.clone()),
            password,
        )
    }

    #[test]
    fn requests_without_the_password_are_refused() {
        let (login, pw) = with_random_password(None);
        let wrong = &pw[1..];
        for uri in [
            "/",
            "/index.html",
            "/ws",
            "/screenshot",
            "/files/list?path=",
            "/wait?idle=500",
            "/stats",
        ] {
            assert!(!admitted(&login, uri, None), "{uri}");
            assert!(
                !admitted(&login, uri, Some(&format!("Bearer {wrong}"))),
                "{uri}"
            );
            assert!(
                !admitted(&login, &format!("{uri}?token={wrong}"), None),
                "{uri}"
            );
        }
        // What the page loads before it can present the password, and health checks.
        for uri in [
            "/client.js",
            "/worker.js?token=x",
            "/inter.woff2",
            "/healthz",
        ] {
            assert!(admitted(&login, uri, None), "{uri}");
        }
    }

    #[test]
    fn each_way_of_sending_the_password_is_accepted() {
        let (login, pw) = with_random_password(None);
        assert!(admitted(
            &login,
            "/screenshot",
            Some(&format!("Bearer {pw}"))
        ));
        assert!(admitted(
            &login,
            "/screenshot",
            Some(&format!("bearer {pw}"))
        ));
        // Basic, with any user name (curl -u :password sends an empty one).
        assert!(admitted(&login, "/", Some(&basic(&format!(":{pw}")))));
        assert!(admitted(&login, "/", Some(&basic(&format!("me:{pw}")))));
        assert!(!admitted(
            &login,
            "/",
            Some(&basic(&format!("me:{}", &pw[1..])))
        ));
        assert!(!admitted(&login, "/", Some("Basic not-base64!")));
        // The link's query, decoded (here every byte is percent-encoded), beside the
        // page's other parameters.
        let encoded: String = pw.bytes().map(|b| format!("%{b:02X}")).collect();
        assert!(admitted(&login, &format!("/?stats&token={encoded}"), None));
        assert!(admitted(&login, &format!("/ws?token={pw}"), None));
        assert!(!admitted(&login, &format!("/ws?token={}", &pw[1..]), None));
    }

    #[test]
    fn basic_auth_user_has_to_match_when_set() {
        let (login, pw) = with_random_password(Some("ubuntu"));
        assert!(admitted(&login, "/", Some(&basic(&format!("ubuntu:{pw}")))));
        assert!(!admitted(&login, "/", Some(&basic(&format!("root:{pw}")))));
        // The user name only applies to Basic credentials.
        assert!(admitted(&login, "/", Some(&format!("Bearer {pw}"))));
        assert!(admitted(&login, &format!("/?token={pw}"), None));
    }

    #[test]
    fn opaque_sessions_cover_cookies_and_embedded_clients() {
        let (login, pw) = with_random_password(None);
        let session = login.new_session();
        assert_eq!(session.len(), 64);
        assert_ne!(session, pw);
        assert!(admitted(&login, &format!("/ws?session={session}"), None));
        assert!(admitted(&login, &format!("/files/list?session={session}"), None));
        let mut headers = HeaderMap::new();
        headers.insert(header::COOKIE, format!("other=x; voxl_session={session}; next=y").parse().unwrap());
        assert!(login.admits(&"/".parse().unwrap(), &headers));
        assert!(login.admits(&"/ws".parse().unwrap(), &headers));
        assert!(!admitted(&login, &format!("/ws?session={}", &session[1..]), None));
        let restarted = Login::new(None, pw);
        assert!(!restarted.admits(&"/ws".parse().unwrap(), &headers));
        login.sessions.lock().unwrap().insert(session.clone(), Instant::now() - Duration::from_secs(1));
        assert!(!login.admits(&"/ws".parse().unwrap(), &headers));
        assert!(!admitted(&login, &format!("/ws?session={session}"), None));
    }

    #[test]
    fn session_cookies_are_httponly_and_secure_in_production() {
        let mut headers = HeaderMap::new();
        headers.insert(header::HOST, "desktop.example.com".parse().unwrap());
        let cookie = session_cookie("test", &headers);
        for flag in ["HttpOnly", "SameSite=Lax", "Secure", "Max-Age=604800", "Path=/"] {
            assert!(cookie.contains(flag));
        }
        headers.insert(header::HOST, "127.0.0.1:6901".parse().unwrap());
        assert!(!session_cookie("test", &headers).contains("Secure"));
        headers.insert("x-forwarded-proto", "https".parse().unwrap());
        assert!(session_cookie("test", &headers).contains("Secure"));
    }

    #[test]
    fn password_comes_from_the_flag_or_is_generated() {
        let args = |v: &[(&str, &str)]| -> HashMap<String, String> {
            v.iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect()
        };
        assert!(Login::from_args(&args(&[("enable-basic-auth", "false")])).is_none());
        let given = random_password();
        let (login, generated) =
            Login::from_args(&args(&[("basic-auth-password", &given)])).unwrap();
        assert_eq!((login.password(), generated), (given.as_str(), false));
        // Without a password from the environment, an empty one counts as none and each
        // start makes up a different one.
        if std::env::var_os("VOXL_PASSWORD").is_none()
            && std::env::var_os("SELKIES_BASIC_AUTH_PASSWORD").is_none()
        {
            let (a, generated) = Login::from_args(&args(&[("basic-auth-password", "")])).unwrap();
            let (b, _) = Login::from_args(&args(&[])).unwrap();
            assert!(generated);
            assert_eq!(a.password().len(), 32);
            assert_ne!(a.password(), b.password());
        }
    }
}
