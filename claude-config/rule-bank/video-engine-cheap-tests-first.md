---
id: video-engine-cheap-tests-first
triggers: [video engine, kling, fal, pipeline test, integration test]
severity: hard
applies_to: [video-engine, n8n]
created: 2026-04-10
source: correction
---
Never burn Kling credits ($1.40/clip) for infrastructure debugging. Test cheap nodes (parse, pre-flight, Claude at $0.03) in isolation first. Use 15s duration (1 clip) for integration tests, not 30s (3 clips). Cache successful clip URLs and reuse them when testing downstream nodes (FFmpeg, Whisper, captions, upload). Only generate new Kling clips when specifically testing video generation quality. Each full 30s test costs $4.25 - treat it like real money.
