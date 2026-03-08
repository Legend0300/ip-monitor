import socket
import threading
import logging
import time

logger = logging.getLogger(__name__)

# Track whether scapy is available
_scapy_available = False
try:
    from scapy.all import sniff, IP, TCP, UDP, ICMP, conf, get_if_addr
    _scapy_available = True
except ImportError:
    logger.warning("Scapy is not installed. Packet capture will be disabled.")
except OSError as e:
    logger.warning("Scapy/Npcap initialization failed: %s. Packet capture will be disabled.", e)


def _detect_local_ips():
    """Detect all local IP addresses on this machine."""
    local_ips = set()

    # Method 1: socket.gethostbyname_ex
    try:
        hostname = socket.gethostname()
        _, _, ip_list = socket.gethostbyname_ex(hostname)
        local_ips.update(ip_list)
    except Exception as e:
        logger.debug("gethostbyname_ex failed: %s", e)

    # Method 2: Connect to external address to find default route IP
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ips.add(s.getsockname()[0])
        s.close()
    except Exception:
        pass

    # Method 3: Scapy's get_if_addr for each interface
    if _scapy_available:
        try:
            for iface in conf.ifaces.values():
                try:
                    ip = get_if_addr(iface)
                    if ip and ip != "0.0.0.0":
                        local_ips.add(ip)
                except Exception:
                    pass
        except Exception as e:
            logger.debug("Scapy interface detection failed: %s", e)

    # Always include loopback
    local_ips.add("127.0.0.1")

    logger.info("Detected local IPs: %s", local_ips)
    return local_ips


def _get_protocol_name(packet):
    """Extract protocol name from a packet."""
    if not _scapy_available:
        return "Unknown"

    if packet.haslayer(TCP):
        return "TCP"
    elif packet.haslayer(UDP):
        return "UDP"
    elif packet.haslayer(ICMP):
        return "ICMP"
    else:
        return "Other"


def _packet_callback(packet, store, local_ips):
    """Process a single captured packet."""
    if not _scapy_available:
        return

    if not packet.haslayer(IP):
        return

    ip_layer = packet[IP]
    src = ip_layer.src
    dst = ip_layer.dst
    length = len(packet)
    protocol = _get_protocol_name(packet)

    # Extract ports from TCP/UDP layers
    src_port = None
    dst_port = None
    if packet.haslayer(TCP):
        src_port = packet[TCP].sport
        dst_port = packet[TCP].dport
    elif packet.haslayer(UDP):
        src_port = packet[UDP].sport
        dst_port = packet[UDP].dport

    store.update(src, dst, length, protocol, local_ips, src_port, dst_port)


def _timeline_flusher(store, stop_event):
    """Flush timeline data every 1 second."""
    while not stop_event.is_set():
        store.flush_timeline()
        stop_event.wait(1.0)


def start_capture(store):
    """Start packet capture in a daemon thread. Returns the thread (or None if scapy unavailable)."""
    if not _scapy_available:
        logger.warning(
            "Packet capture not started — Scapy/Npcap is not available. "
            "Install Npcap (https://npcap.com) and scapy to enable capture."
        )
        # Still start the timeline flusher so the API works with empty data
        stop_event = threading.Event()
        flusher = threading.Thread(
            target=_timeline_flusher, args=(store, stop_event), daemon=True
        )
        flusher.start()
        return None

    local_ips = _detect_local_ips()
    stop_event = threading.Event()

    def _sniff_thread():
        logger.info("Starting packet capture...")
        try:
            sniff(
                prn=lambda pkt: _packet_callback(pkt, store, local_ips),
                store=False,  # Don't store packets in memory
                stop_filter=lambda _: stop_event.is_set(),
            )
        except PermissionError:
            logger.error(
                "Permission denied for packet capture. "
                "Run as Administrator or install Npcap with WinPcap compatibility."
            )
        except Exception as e:
            logger.error("Packet capture failed: %s", e)

    capture_thread = threading.Thread(target=_sniff_thread, daemon=True)
    capture_thread.start()

    flusher_thread = threading.Thread(
        target=_timeline_flusher, args=(store, stop_event), daemon=True
    )
    flusher_thread.start()

    logger.info("Capture and timeline flusher threads started.")
    return capture_thread
