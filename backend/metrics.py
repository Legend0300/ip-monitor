import threading
import time
import collections


class MetricsStore:
    def __init__(self):
        self._lock = threading.Lock()
        self.ips = {}  # ip -> {bytes_sent, bytes_received, packets_sent, packets_received, first_seen, last_seen, protocols, geo}
        self.timeline = collections.deque(maxlen=300)  # 5 min at 1s intervals
        self.protocols = {}  # protocol_name -> total_bytes
        self._interval_bytes_in = 0
        self._interval_bytes_out = 0
        self._start_time = time.time()

    def update(self, src_ip, dst_ip, length, protocol, local_ips):
        """Called per packet. local_ips is set of this machine's IPs."""
        with self._lock:
            now = time.time()

            for ip, is_sender in [(src_ip, True), (dst_ip, False)]:
                if ip not in self.ips:
                    self.ips[ip] = {
                        "bytes_sent": 0,
                        "bytes_received": 0,
                        "packets_sent": 0,
                        "packets_received": 0,
                        "first_seen": now,
                        "last_seen": now,
                        "protocols": {},
                        "geo": None,
                    }
                entry = self.ips[ip]
                entry["last_seen"] = now
                if is_sender:
                    entry["bytes_sent"] += length
                    entry["packets_sent"] += 1
                else:
                    entry["bytes_received"] += length
                    entry["packets_received"] += 1
                entry["protocols"][protocol] = entry["protocols"].get(protocol, 0) + length

            self.protocols[protocol] = self.protocols.get(protocol, 0) + length
            self._interval_bytes_in += length if dst_ip in local_ips else 0
            self._interval_bytes_out += length if src_ip in local_ips else 0

    def flush_timeline(self):
        """Called every 1s to push a timeline point."""
        with self._lock:
            self.timeline.append({
                "timestamp": time.time(),
                "bytes_in": self._interval_bytes_in,
                "bytes_out": self._interval_bytes_out,
            })
            self._interval_bytes_in = 0
            self._interval_bytes_out = 0

    def set_geo(self, ip, geo_data):
        with self._lock:
            if ip in self.ips:
                self.ips[ip]["geo"] = geo_data

    def get_summary(self):
        with self._lock:
            total_in = sum(e["bytes_received"] for e in self.ips.values())
            total_out = sum(e["bytes_sent"] for e in self.ips.values())
            return {
                "total_bytes_in": total_in,
                "total_bytes_out": total_out,
                "active_ips": len(self.ips),
                "uptime": time.time() - self._start_time,
                "total_packets": sum(
                    e["packets_sent"] + e["packets_received"] for e in self.ips.values()
                ) // 2,
            }

    def get_all_ips(self):
        with self._lock:
            return [{"ip": ip, **data} for ip, data in self.ips.items()]

    def get_ip(self, ip):
        with self._lock:
            if ip in self.ips:
                return {"ip": ip, **self.ips[ip]}
            return None

    def get_top(self, limit=10):
        with self._lock:
            items = [
                {"ip": ip, "total_bytes": d["bytes_sent"] + d["bytes_received"], **d}
                for ip, d in self.ips.items()
            ]
            items.sort(key=lambda x: x["total_bytes"], reverse=True)
            return items[:limit]

    def get_protocols(self):
        with self._lock:
            return dict(self.protocols)

    def get_timeline(self):
        with self._lock:
            return list(self.timeline)

    def get_ips_needing_geo(self):
        with self._lock:
            return [ip for ip, data in self.ips.items() if data["geo"] is None]
