# syntax=docker/dockerfile:1
# One-off context audit — docker build -f docker/verify-context.Dockerfile .
FROM alpine:3.20
WORKDIR /ctx
COPY . .
RUN set -e; \
  test ! -e .env && echo "OK: .env excluded" || (echo "FAIL: .env in context" && exit 1); \
  test ! -d node_modules && echo "OK: node_modules excluded" || (echo "FAIL: node_modules in context" && exit 1); \
  test ! -d .git && echo "OK: .git excluded" || (echo "FAIL: .git in context" && exit 1); \
  test ! -d docs && echo "OK: docs excluded" || (echo "FAIL: docs in context" && exit 1); \
  test -e README.md && echo "OK: README.md included" || (echo "FAIL: README.md missing" && exit 1); \
  test -e .env.example && echo "OK: .env.example included" || (echo "FAIL: .env.example missing" && exit 1); \
  find . -name '*.test.ts' | head -1 | grep -q . && (echo "FAIL: test files in context" && exit 1) || echo "OK: *.test.ts excluded"; \
  echo "Context audit passed."
