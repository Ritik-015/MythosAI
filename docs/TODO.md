# Next implementation tasks

## Verify on the user's Windows PC
- [ ] Install requirements from a fresh `.venv` and confirm UTF-8 requirements install cleanly.
- [ ] Run `python -m unittest discover -s tests -v` with project dependencies installed.
- [ ] Start LM Studio, verify `/v1/models`, and check the `/api/health` response.
- [ ] Verify chat streams and errors recover without mixing conversation histories.
- [ ] Perform a real search query against the chosen provider.

## Next development slices
- [ ] Add Flask route integration tests and Socket.IO tests.
- [ ] Add a cancellation event and abort support for in-flight generation.
- [ ] Add persistent, validated capability configuration and lifecycle hooks.
- [ ] Implement local document search with explicit include/exclude paths and index deletion.
- [ ] Build a limited crawler/index with robots.txt, sitemaps, polite scheduling, duplicate detection and BM25 evaluation.
- [ ] Ground optional AI summaries in retrieved sources and include source citations.
- [ ] Implement real voice capture, local speech recognition, TTS, interruption, and event-driven orb states.
- [ ] Replace CDN-loaded Marked and Prism assets if a completely offline browser shell is required.
- [ ] Add production security review before any non-loopback deployment.
