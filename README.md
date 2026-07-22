# whalo.server.backend.live.segmentation.service

Minimal Express 5 backend service scaffold for live player segmentation.

## Included infrastructure

- S3 runtime configuration
- Winfra configuration SDK
- Redis lifecycle through `PlayerLoginRepository`
- SQS-backed API metrics and request monitoring
- Shared Whalo entities and HTTP DAL packages

Domain routes and outbound communicators can be added once the live-segmentation API contract is defined.

## Routes

- `POST /ping` returns the standard Whalo success envelope with `"pong"`.

## Local run

```bash
npm install
npm run local
```
