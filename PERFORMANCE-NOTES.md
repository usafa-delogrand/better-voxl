# Performance investigation — 2026-11-04

## Measurements

- VM: four CPUs, 8 GiB RAM; display 1920×1080, software x264 ultrafast, 60 fps ceiling,
  four sliced encoder threads and one conversion thread.
- Hex background dictation used roughly 1–3 CPU cores during initial samples.
  It has been uninstalled and purged at the user's request. Removed its ~700 MB
  user-data directory, state/config/cache locations and autostart entry.
- After uninstall: approximately 2.7 GiB memory available, no ongoing memory
  pressure, and substantially less CPU pressure. Burp remains the largest RAM
  consumer (~2.4 GiB), but has not been closed or reconfigured.
- Active iPad stream observations: network minimum RTT around 18–24 ms; excess
  acknowledgement queue delay mostly 7–25 ms, with observed spikes up to 62 ms.
  No recent NIC drops/errors or tunnel connection errors were observed.
- Encoding: median 12.43 ms/frame; observed 8.21–30.39 ms/frame in two-second
  samples. Heavy content can exceed the 16.67 ms budget for sustained 60 fps.
- Observed stream cadence peaked at 47.4 fps. Low fps while a desktop is mostly
  static is expected: capture is damage-driven, not a fixed-rate video source.

## Fixed

The rate controller reused cached delay and throughput readings on every 100 ms
update. One old congestion sample could repeatedly reduce an idle stream's cap
from 8 Mbps to the 2 Mbps floor; cached high throughput could also cause repeated
upward probing without new evidence. Regression tests reproduced both failures.

Delay estimates now count matched frame acknowledgements. Each controller consumes
a sample only once. New congestion still backs off, genuinely aging in-flight
frames still trigger throttling without an acknowledgement, and genuine fresh
throughput still permits upward probing. Per-client feedback tracking is pruned
when viewers leave.

The mobile dock also uses an opaque background rather than a live 30px backdrop
blur, reducing avoidable compositing work. Mouse sensitivity was not changed as
part of the frame-delivery investigation.

## Motion-search tuning (later same day)

The `ultrafast` preset was overridden with UMH motion search and range 64. Added
`VOXL_MOTION_SEARCH=umh|hex|dia` (default remains UMH for other installations), with
invalid values rejected. This VM selects HEX via
`/etc/systemd/system/voxl-stream.service.d/70-motion-performance.conf`.

Reproducible ignored benchmark `encoder::motion_bench::motion_cost` uses identical
synthetic 1920×1080 text/image-like scrolling frames. Repeated measurements:

| Search / threads | Normal scroll mean | Fast scroll mean | Fast scroll p95 |
| --- | --- | --- | --- |
| UMH / 4 | 21.6–21.7 ms | 26.7–26.9 ms | 36.4–38.2 ms |
| HEX / 4 | 14.0–15.0 ms | 15.0–15.5 ms | 19.8–20.8 ms |
| HEX / 2 | 15.5 ms | 17.4 ms | 26.5 ms |

HEX/4 reduced measured encoding time by approximately 30–45%; measured fast-scroll
bitrate was similar or slightly lower. These are synthetic encoder timings, not
claims of actual iPad end-to-end frame rate. Image content and network conditions
still matter. Static CRF/refinement settings, resolution and 60fps ceiling remain
unchanged. No GPU device is exposed to this VM, so hardware encoding isn't an
available drop-in option.

Run: `VOXL_MOTION_SEARCH=hex T=4 cargo test --release motion_cost -- --ignored --nocapture`.
Revert the tuning by changing the drop-in to `VOXL_MOTION_SEARCH=umh`, reloading
systemd and restarting Voxl (does not close desktop applications).

## Remaining limits / cautions

- The container rejects raising process niceness priority: the service requests
  Nice=-5, but running threads report NI=0. Do not claim the requested priority is
  taking effect, and do not weaken container isolation merely to enable it.
- Software encoding of dense 1080p updates can exceed the 60 fps frame budget.
  Resolution/frame-rate reductions are possible tradeoffs, not applied silently.
- Server acknowledgement timing includes both network and client decode effects;
  it cannot prove which is responsible without client-side measurements.
- Passing controller regression tests does not prove that every remaining iPad
  frame-pacing problem is resolved. An active-stream retest is still needed.
