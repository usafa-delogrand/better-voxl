use super::*;

/// Synthetic full-screen scrolling workload; identical images for each search method.
/// VOXL_MOTION_SEARCH=hex T=4 cargo test --release motion_cost -- --ignored --nocapture
#[test]
#[ignore]
fn motion_cost() {
    let (w, h) = (1920usize, 1080usize);
    let threads = std::env::var("T")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(4);
    let mut page = vec![22u8; w * (h + 1024)];
    // Reproducible text-like blocks, panels, gradients and image-like detail.
    let mut seed = 12345u32;
    for row in 0..h + 1024 {
        for col in 0..w {
            seed ^= seed << 13;
            seed ^= seed >> 17;
            seed ^= seed << 5;
            page[row * w + col] = if col < 400 {
                if row % 28 < 16 && col % 12 < 7 {
                    180 + (seed % 60) as u8
                } else {
                    30
                }
            } else if col < 1300 {
                if row % 24 < 14 && col % 9 < 5 {
                    40 + (seed % 90) as u8
                } else {
                    235
                }
            } else {
                (((col / 3 + row / 2) % 180) + (seed % 50) as usize) as u8
            };
        }
    }
    for (label, shift) in [("scroll", 16usize), ("fast-scroll", 64usize)] {
        let mut enc = Encoder::new(&EncoderConfig {
            width: w as u32,
            height: h as u32,
            fps: 60,
            preset: "ultrafast".into(),
            threads,
            crf: 24.0,
            max_kbps: 16000,
        })
        .unwrap();
        let u = vec![128u8; w * h / 4];
        let mut out = Vec::new();
        let mut times = Vec::new();
        let mut bytes = 0usize;
        for f in 0..100 {
            let offset = (f * shift) % 1024;
            let planes = Planes {
                y: &page[offset * w..(offset + h) * w],
                u: &u,
                v: &u,
                stride_y: w,
                stride_uv: w / 2,
            };
            out.clear();
            let t = std::time::Instant::now();
            enc.encode(&planes, f as i64 * 17, f == 0, None, None, &mut out)
                .unwrap();
            let ms = t.elapsed().as_secs_f64() * 1000.0;
            if f >= 20 {
                times.push(ms);
                bytes += out.len();
            }
        }
        times.sort_by(f64::total_cmp);
        println!(
            "MOTION {} {threads}t {label}: avg {:.2}ms p95 {:.2}ms, {:.2} Mbps at 60fps",
            std::env::var("VOXL_MOTION_SEARCH").unwrap_or_else(|_| "umh".into()),
            times.iter().sum::<f64>() / times.len() as f64,
            times[times.len() * 95 / 100],
            bytes as f64 / times.len() as f64 * 60.0 * 8.0 / 1e6
        );
    }
}
