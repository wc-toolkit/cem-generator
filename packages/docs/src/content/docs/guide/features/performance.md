---
title: Performance
description: Performance characteristics and benchmarks.
---

## Performance characteristics

- **Single-pass** TypeScript program creation
- **Parallelizable** per-file analysis (detectors run independently)
- **Incremental-friendly**: only re-analyzes changed files with watch mode
- **Minimal memory**: streams results, doesn't hold full ASTs

## Benchmarks

Typical large project (100+ components):

| Metric | Time |
|--------|------|
| Cold start (first run) | ~2-5 seconds |
| Incremental (watch mode) | ~200-500ms |
| Memory usage | ~150-300 MB |

## Tips for faster builds

1. **Use `include`/`exclude`** to limit analyzed files
2. **Disable inheritance** if not needed: `inheritance: false`
3. **Use `last-wins` conflict policy** to avoid error overhead
4. **Run in watch mode** during development for instant feedback

## Watch mode example

```bash
# Using a file watcher like chokidar or nodemon
npx nodemon --watch src --ext ts --exec "cem generate"
```