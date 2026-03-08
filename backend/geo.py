import ipaddress
import logging
import asyncio
import httpx

logger = logging.getLogger(__name__)

# Local cache so each IP is only looked up once
_geo_cache = {}

PRIVATE_GEO = {
    "status": "private",
    "country": "Private",
    "countryCode": "",
    "region": "",
    "regionName": "",
    "city": "Local Network",
    "zip": "",
    "lat": 0,
    "lon": 0,
    "timezone": "",
    "isp": "Private Range",
    "org": "",
    "as": "",
    "query": "",
}


def is_private_ip(ip_str):
    """Check if an IP is private/reserved/loopback."""
    try:
        addr = ipaddress.ip_address(ip_str)
        return (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_multicast
            or addr.is_reserved
            or addr.is_unspecified
        )
    except ValueError:
        return True


async def batch_lookup(ips):
    """Look up a batch of IPs using ip-api.com batch endpoint (max 100)."""
    if not ips:
        return {}

    # ip-api.com batch endpoint accepts POST with JSON array, max 100 per request
    url = "http://ip-api.com/batch"
    results = {}

    # Process in chunks of 100
    for i in range(0, len(ips), 100):
        chunk = ips[i : i + 100]
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json=chunk)
                if resp.status_code == 200:
                    data = resp.json()
                    for entry in data:
                        ip = entry.get("query", "")
                        if ip:
                            results[ip] = entry
                elif resp.status_code == 429:
                    logger.warning("ip-api.com rate limit hit, backing off")
                    await asyncio.sleep(5)
                else:
                    logger.warning("ip-api.com returned status %d", resp.status_code)
        except Exception as e:
            logger.warning("Geo batch lookup failed: %s", e)

    return results


async def enrich_ips(store, ips):
    """Enrich a list of IPs with geo data, updating the store."""
    to_lookup = []

    for ip in ips:
        # Check cache first
        if ip in _geo_cache:
            store.set_geo(ip, _geo_cache[ip])
            continue

        # Mark private IPs immediately
        if is_private_ip(ip):
            geo = {**PRIVATE_GEO, "query": ip}
            _geo_cache[ip] = geo
            store.set_geo(ip, geo)
            continue

        to_lookup.append(ip)

    if not to_lookup:
        return

    results = await batch_lookup(to_lookup)

    for ip in to_lookup:
        if ip in results:
            _geo_cache[ip] = results[ip]
            store.set_geo(ip, results[ip])
        else:
            # Mark as unknown so we don't keep retrying
            unknown = {"status": "fail", "message": "Not found", "query": ip}
            _geo_cache[ip] = unknown
            store.set_geo(ip, unknown)


async def geo_enrichment_loop(store):
    """Background task that periodically enriches IPs lacking geo data."""
    while True:
        try:
            needing = store.get_ips_needing_geo()
            if needing:
                await enrich_ips(store, needing)
        except Exception as e:
            logger.warning("Geo enrichment error: %s", e)

        # ip-api.com free tier: 45 requests/min for single, 15 req/min for batch
        # Check every 5 seconds for new IPs
        await asyncio.sleep(5)
