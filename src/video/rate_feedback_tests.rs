use super::*;
use crate::hub::Client;

fn viewer(queue_ms: f64, delivered_kbps: f64) -> (Arc<Hub>, Arc<Client>) {
    let hub = Hub::new();
    let (tx, _) = tokio::sync::mpsc::unbounded_channel();
    let client = hub.add_client(tx);
    client.started.store(true, Ordering::Relaxed);
    feedback(&client, 1, queue_ms);
    client.delivered.lock().rate_bps = delivered_kbps * 1000.0;
    (hub, client)
}

fn feedback(client: &Client, id: u32, queue_ms: f64) {
    client.inflight.lock().push_back(Inflight {
        id,
        sent: Instant::now(),
        bytes: 1000,
    });
    client.on_ack(id);
    client.delay.lock().queue_ms = queue_ms;
}

fn round(ctl: &mut RateCtl, hub: &Hub, client: &Arc<Client>) {
    let past = Instant::now() - Duration::from_secs(2);
    ctl.last_eval = past;
    ctl.last_inc = past;
    ctl.last_dec = past;
    ctl.update(hub, std::slice::from_ref(client));
}

#[test]
fn stale_delay_is_not_reused_for_repeated_backoff() {
    let (hub, client) = viewer(80.0, 1000.0);
    let mut ctl = RateCtl::new(30000.0, 2000.0);
    round(&mut ctl, &hub, &client);
    let once = ctl.target;
    assert!(once < 8000.0, "fresh congestion must still reduce bitrate");
    for _ in 0..12 {
        round(&mut ctl, &hub, &client);
    }
    assert_eq!(
        ctl.target, once,
        "an idle cached delay must not drive bitrate to its floor"
    );
}

#[test]
fn cached_idle_throughput_does_not_repeatedly_probe_upward() {
    let (hub, client) = viewer(0.0, 7000.0);
    let mut ctl = RateCtl::new(30000.0, 2000.0);
    round(&mut ctl, &hub, &client);
    let once = ctl.target;
    assert!(once > 8000.0);
    for _ in 0..12 {
        round(&mut ctl, &hub, &client);
    }
    assert_eq!(
        ctl.target, once,
        "idle throughput is not fresh capacity evidence"
    );
}

#[test]
fn fresh_congestion_continues_backing_off() {
    let (hub, client) = viewer(80.0, 1000.0);
    let mut ctl = RateCtl::new(30000.0, 2000.0);
    round(&mut ctl, &hub, &client);
    let once = ctl.target;
    feedback(&client, 2, 80.0);
    round(&mut ctl, &hub, &client);
    assert!(ctl.target < once);
}

#[test]
fn genuinely_stalled_inflight_frames_still_reduce_bitrate() {
    let (hub, client) = viewer(0.0, 1000.0);
    let mut ctl = RateCtl::new(30000.0, 2000.0);
    round(&mut ctl, &hub, &client);
    client.inflight.lock().push_back(Inflight {
        id: 2,
        sent: Instant::now() - Duration::from_millis(500),
        bytes: 1000,
    });
    round(&mut ctl, &hub, &client);
    assert!(
        ctl.target < 8000.0,
        "a real backlog cannot be ignored just because no ack arrived"
    );
}
