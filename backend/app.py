import asyncio
import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from metrics import MetricsStore
from capture import start_capture
from geo import geo_enrichment_loop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="IP Monitor", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store = MetricsStore()


@app.on_event("startup")
async def startup():
    # Start packet capture in background thread
    start_capture(store)
    logger.info("Packet capture started.")

    # Start geo enrichment as an asyncio background task
    asyncio.create_task(geo_enrichment_loop(store))
    logger.info("Geo enrichment background task started.")


# ── REST Endpoints ──────────────────────────────────────────────


@app.get("/api/summary")
async def get_summary():
    return store.get_summary()


@app.get("/api/ips")
async def get_ips():
    return store.get_all_ips()


@app.get("/api/ips/{ip}")
async def get_ip(ip: str):
    result = store.get_ip(ip)
    if result is None:
        raise HTTPException(status_code=404, detail="IP not found")
    return result


@app.get("/api/top")
async def get_top(limit: int = Query(default=10, ge=1, le=100)):
    return store.get_top(limit)


@app.get("/api/protocols")
async def get_protocols():
    return store.get_protocols()


@app.get("/api/timeline")
async def get_timeline():
    return store.get_timeline()


# ── WebSocket ───────────────────────────────────────────────────


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    logger.info("WebSocket client connected.")

    try:
        while True:
            timeline = store.get_timeline()
            latest_point = timeline[-1] if timeline else None

            payload = {
                "type": "update",
                "summary": store.get_summary(),
                "top_ips": store.get_top(10),
                "protocols": store.get_protocols(),
                "timeline_point": latest_point,
            }
            await ws.send_json(payload)
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected.")
    except Exception as e:
        logger.warning("WebSocket error: %s", e)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8420)
