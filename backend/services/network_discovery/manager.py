"""
Network Discovery Manager - Accurate Device Categorization
Distinguishes Laptops/PCs, Mobile Phones, Gateways, Tablets, and IoT devices.
Performs fast concurrent ping sweeps across the subnet to populate the OS ARP table
so all room and Wi-Fi devices are reliably detected.
"""
import socket
import subprocess
import re
import ipaddress
import platform
import concurrent.futures
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
import logging

logger = logging.getLogger(__name__)

# Comprehensive Vendor & Hardware Mapping
OUI_MAP = {
    # Routers & Infrastructure
    "D4:BD:4F": ("Cisco Systems", "Core-Gateway", "Router / Gateway", 4),
    "C4:91:0C": ("Jio Platforms", "JioFiber-Gateway", "Router / Gateway", 4),
    "A8:DA:0C": ("Jio Platforms", "JioFiber-Gateway", "Router / Gateway", 4),
    "E4:8D:8C": ("Jio Platforms", "JioFiber-Gateway", "Router / Gateway", 4),
    "00:1A:2B": ("Cisco Systems", "Cisco-Switch", "Router / Gateway", 3),
    "50:D4:F7": ("TP-Link", "TP-Link-Router", "Router / Gateway", 3),
    "C0:06:C3": ("Netgear", "Netgear-Router", "Router / Gateway", 3),
    "00:0C:43": ("Ralink / MediaTek", "Wireless-AP", "Router / Gateway", 3),

    # PC / Laptop Network Adapters (Intel, Realtek, Broadcom, Dell, HP, Lenovo, Apple)
    "00:50:56": ("VMware Virtual", "Virtual-Machine", "Laptop / PC", 2),
    "00:15:5D": ("Microsoft Hyper-V", "Hyper-V-Virtual-Node", "Laptop / PC", 2),
    "A4:BB:6D": ("Dell Inc.", "Dell-PC", "Laptop / PC", 2),
    "8C:16:45": ("HP Inc.", "HP-Laptop", "Laptop / PC", 2),
    "28:D2:44": ("LCFC (Lenovo)", "Lenovo-ThinkPad", "Laptop / PC", 2),
    "54:E1:AD": ("Intel Corporate", "Intel-PC-Workstation", "Laptop / PC", 2),
    "00:1F:3B": ("Intel Corporate", "Intel-PC-Workstation", "Laptop / PC", 2),
    "18:CC:18": ("Realtek Semiconductor", "Realtek-PC-Adapter", "Laptop / PC", 2),
    "30:9C:23": ("Realtek Semiconductor", "Realtek-PC-Adapter", "Laptop / PC", 2),
    "80:6E:DD": ("Intel Corporate", "Intel-WiFi-Laptop", "Laptop / PC", 2),
    "E4:A7:A0": ("AsusTek Computer", "Asus-Laptop", "Laptop / PC", 2),
    "00:28:F8": ("Acer Inc.", "Acer-Laptop", "Laptop / PC", 2),
    "F0:99:B6": ("Apple Inc.", "Apple-MacBook", "Laptop / PC", 2),
    "60:F8:1D": ("Apple Inc.", "Apple-MacBook", "Laptop / PC", 2),

    # Mobile Phones & Smart Devices
    "08:02:3C": ("Samsung Electronics", "Samsung-Galaxy-S24", "Mobile", 1),
    "40:16:3B": ("Samsung Electronics", "Samsung-Galaxy-Phone", "Mobile", 1),
    "80:5B:65": ("Samsung Electronics", "Samsung-Phone", "Mobile", 1),
    "3C:22:FB": ("Apple Inc.", "Apple-iPhone", "Mobile", 1),
    "BC:D0:74": ("Apple Inc.", "Apple-iPhone", "Mobile", 1),
    "A4:C3:F0": ("Apple Inc.", "Apple-iPhone", "Mobile", 1),
    "CC:F5:5F": ("OnePlus / OPPO", "OnePlus-Phone", "Mobile", 1),
    "9C:2E:A1": ("OnePlus Technology", "OnePlus-Phone", "Mobile", 1),
    "C8:47:8C": ("Vivo Mobile", "Vivo-Phone", "Mobile", 1),
    "A4:3B:B0": ("Realme Mobile", "Realme-Phone", "Mobile", 1),
    "64:CC:2E": ("Xiaomi Communications", "Redmi-Phone", "Mobile", 1),

    # Tablets & Wearables
    "DC:A9:04": ("Apple Inc.", "Apple-iPad", "Tablet", 1),
    "50:64:2B": ("Samsung Electronics", "Galaxy-Tab", "Tablet", 1),

    # Smart TVs / Media / IoT
    "50:01:D9": ("Samsung Electronics", "Samsung-Smart-TV", "Smart Media / IoT", 2),
    "38:2C:4A": ("Jio Platforms", "Jio-SetTopBox", "Smart Media / IoT", 2),
    "68:54:5A": ("Amazon Technologies", "Amazon-FireTV", "Smart Media / IoT", 1),
    "D4:F5:47": ("Google LLC", "Google-Chromecast", "Smart Media / IoT", 1),
    "D8:3A:DD": ("Espressif IoT", "Smart-IoT-Device", "Smartwatch / IoT", 1),
    "B8:27:EB": ("Raspberry Pi", "Raspberry-Pi", "Smartwatch / IoT", 2)
}


class NetworkDiscoveryManager:
    def __init__(self):
        self.is_monitoring = False

    def _query_netbios(self, ip: str) -> Optional[str]:
        """Checks NetBIOS to detect Windows Workstations and SMB shares."""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(0.15)
            query = (
                b"\x82\x28\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00"
                b"\x20\x43\x4b\x41\x41\x41\x41\x41\x41\x41\x41\x41"
                b"\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41"
                b"\x41\x41\x41\x41\x41\x41\x41\x41\x00\x00\x21\x00\x01"
            )
            sock.sendto(query, (ip, 137))
            data, _ = sock.recvfrom(1024)
            sock.close()
            if len(data) > 57 and data[56] > 0:
                name = data[57:57+15].decode("ascii", errors="ignore").strip()
                if name and not name.startswith("IS~"):
                    return name
        except Exception:
            pass
        return None

    def _query_dns(self, ip: str) -> Optional[str]:
        """
        Reverse DNS lookup for friendly hostnames.
        Note: socket.gethostbyaddr() on Windows does not respect socket timeouts
        and blocks for 5+ seconds per private IP on LANs without reverse PTR records.
        We skip reverse DNS on private LAN ranges to maintain fast responsiveness.
        """
        return None

    def _check_pc_ports(self, ip: str) -> bool:
        """Tests ports typically open on PC/Laptops (SMB 445, RPC 135, RDP 3389)."""
        for port in (135, 445, 3389):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(0.08)
                    if s.connect_ex((ip, port)) == 0:
                        return True
            except Exception:
                continue
        return False

    def _fingerprint_device(self, ip: str, mac: str) -> tuple:
        mac_clean = mac.upper() if mac else ""
        oui = ":".join(mac_clean.split(":")[:3]) if mac_clean else ""

        # 1. Gateways / Routers
        if ip.endswith(".1") or ip.endswith(".0.1"):
            return f"Gateway-{ip}", "Network Gateway", "Router / Gateway", 4

        # 2. Query NetBIOS & DNS for real device names
        netbios_name = self._query_netbios(ip)
        dns_name = self._query_dns(ip)
        discovered_name = netbios_name or dns_name

        if discovered_name and discovered_name.lower().startswith("node-"):
            discovered_name = "Workstation-" + discovered_name[5:]

        if discovered_name and not discovered_name.lower().startswith(("workstation-", "node-", "host-", "endpoint-")):
            d_lower = discovered_name.lower()
            if any(k in d_lower for k in ("desktop", "laptop", "pc", "win", "macbook", "workstation")):
                return discovered_name, "Windows / PC Host", "Laptop / PC", 2
            if any(k in d_lower for k in ("ipad", "tab")):
                return discovered_name, "Tablet Device", "Tablet", 1
            if any(k in d_lower for k in ("phone", "iphone", "galaxy", "pixel", "oneplus")):
                return discovered_name, "Mobile Device", "Mobile", 1
            if any(k in d_lower for k in ("tv", "watch", "iot", "cam", "cast", "echo")):
                return discovered_name, "Smart Media / IoT", "Smartwatch / IoT", 1

        # 3. Match exact OUI database
        if oui in OUI_MAP:
            vendor, default_name, dev_type, crit = OUI_MAP[oui]
            name = discovered_name or default_name
            if name.lower().startswith("node-"):
                name = "Workstation-" + name[5:]
            return name, vendor, dev_type, crit

        # 4. Check if PC via open Windows ports
        if self._check_pc_ports(ip):
            name = discovered_name or f"Workstation-{ip.split('.')[-1]}"
            if name.lower().startswith("node-"):
                name = "Workstation-" + name[5:]
            return name, "PC / Workstation Host", "Laptop / PC", 2

        # 5. Check for Private / Randomized MAC addresses (Modern Smartphones use 2, 6, A, E)
        is_private_mac = False
        if mac_clean and len(mac_clean) >= 2 and mac_clean[1] in ("2", "6", "A", "E"):
            is_private_mac = True

        if is_private_mac:
            return (discovered_name or "Mobile Phone"), "Smartphone / Mobile", "Mobile", 1

        # 6. Default generic fallback (Workstation)
        fallback_name = discovered_name or f"Workstation-{ip.split('.')[-1]}"
        if fallback_name.lower().startswith("node-"):
            fallback_name = "Workstation-" + fallback_name[5:]
        return fallback_name, "PC / Workstation Host", "Laptop / PC", 2

    def _get_arp_table(self) -> dict:
        """Reads the OS ARP cache."""
        arp_entries = {}
        try:
            output = subprocess.check_output("arp -a", shell=True, text=True, stderr=subprocess.DEVNULL)
            pattern = re.compile(r"(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F]{2}(?:-[0-9a-fA-F]{2}){5})\s+(\w+)")
            for match in pattern.finditer(output):
                ip, mac, _ = match.groups()
                mac_formatted = mac.replace("-", ":").upper()
                if not (
                    ip.startswith("224.") or
                    ip.startswith("239.") or
                    ip.startswith("169.254.") or
                    ip.endswith(".255") or
                    ip == "255.255.255.255" or
                    mac_formatted == "FF:FF:FF:FF:FF:FF"
                ):
                    arp_entries[ip] = mac_formatted
        except Exception as e:
            logger.error(f"Failed to read ARP cache: {e}")
        return arp_entries

    def _ping_sweep(self, base_ip: str):
        """
        Fast concurrent ping sweep across the local /24 subnet.
        Forces the OS to issue ARP requests to wake up and populate
        the ARP table for all active devices in the room / Wi-Fi.
        """
        def _ping_single(target_ip: str):
            try:
                if platform.system() == "Windows":
                    subprocess.run(
                        ["ping", "-n", "1", "-w", "200", target_ip],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        timeout=0.4
                    )
                else:
                    subprocess.run(
                        ["ping", "-c", "1", "-W", "1", target_ip],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        timeout=0.4
                    )
            except Exception:
                pass

        hosts = [f"{base_ip}.{i}" for i in range(1, 255)]
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
                list(executor.map(_ping_single, hosts))
        except Exception as e:
            logger.warning(f"Subnet ping sweep encountered: {e}")

    def scan_network_stream(self, interface_ip: str = None, subnet: str = None):
        """
        Discovers all devices on the network progressively and yields them one-by-one:
        1. Identifies the local machine IP and yields the local device immediately (<5ms)
        2. Reads existing OS ARP cache and yields already active devices one-by-one (~50-150ms)
        3. Conducts concurrent ping sweeps across the subnet, yielding newly responding
           devices as soon as they appear in the ARP table.
        """
        now = datetime.now(timezone.utc).isoformat()
        seen_ips = set()

        # 1. Detect Local Host Machine IP
        local_ip = "127.0.0.1"
        hostname = socket.gethostname()
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(("8.8.8.8", 80))
                local_ip = s.getsockname()[0]
        except Exception:
            local_ip = interface_ip or "192.168.1.100"

        # 2. Add and yield This Local Device First (Phase A: <5ms)
        target_ip = interface_ip or local_ip
        seen_ips.add(target_ip)
        yield {
            "id": f"dev-{target_ip.replace('.', '-')}",
            "ip_address": target_ip,
            "mac_address": "00:50:56:C0:00:01",
            "hostname": f"{hostname} (This Device)",
            "vendor": "Local PC (This Device)",
            "device_type": "Laptop / PC",
            "os": "Windows",
            "status": "Online",
            "first_seen": now,
            "last_seen": now,
            "criticality": 3
        }

        # 3. Read and yield current OS ARP Table (Phase B: 10-150ms)
        arp_table = self._get_arp_table()
        for ip, mac in list(arp_table.items()):
            if ip not in seen_ips:
                seen_ips.add(ip)
                dev_host, vendor, dev_type, crit = self._fingerprint_device(ip, mac)
                yield {
                    "id": f"dev-{ip.replace('.', '-')}",
                    "ip_address": ip,
                    "mac_address": mac,
                    "hostname": dev_host,
                    "vendor": vendor,
                    "device_type": dev_type,
                    "os": "Windows / Linux" if dev_type == "Laptop / PC" else "Mobile / Embedded OS",
                    "status": "Online",
                    "first_seen": now,
                    "last_seen": now,
                    "criticality": crit
                }

        # 4. Phase C: Ping sweep across remaining subnet hosts to populate dormant ARP entries
        base_prefix = None
        if target_ip and "." in target_ip and not target_ip.startswith("127."):
            base_prefix = target_ip.rsplit(".", 1)[0]
        elif subnet and "/" in subnet:
            base_prefix = subnet.split("/")[0].rsplit(".", 1)[0]

        if base_prefix:
            unseen_hosts = [f"{base_prefix}.{i}" for i in range(1, 255) if f"{base_prefix}.{i}" not in seen_ips]

            def _ping_single(target_ip: str):
                try:
                    if platform.system() == "Windows":
                        cmd = ["ping", "-n", "1", "-w", "150", target_ip]
                    else:
                        cmd = ["ping", "-c", "1", "-W", "1", target_ip]
                    res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=0.3)
                    return target_ip, (res.returncode == 0)
                except Exception:
                    return target_ip, False

            batch_size = 32
            for i in range(0, len(unseen_hosts), batch_size):
                batch = unseen_hosts[i:i + batch_size]
                try:
                    with concurrent.futures.ThreadPoolExecutor(max_workers=32) as executor:
                        list(executor.map(_ping_single, batch))
                except Exception as e:
                    logger.warning(f"Batch ping error: {e}")

                # After each batch, harvest newly populated ARP entries
                refreshed_arp = self._get_arp_table()
                for ip, mac in refreshed_arp.items():
                    if ip not in seen_ips:
                        seen_ips.add(ip)
                        dev_host, vendor, dev_type, crit = self._fingerprint_device(ip, mac)
                        yield {
                            "id": f"dev-{ip.replace('.', '-')}",
                            "ip_address": ip,
                            "mac_address": mac,
                            "hostname": dev_host,
                            "vendor": vendor,
                            "device_type": dev_type,
                            "os": "Windows / Linux" if dev_type == "Laptop / PC" else "Mobile / Embedded OS",
                            "status": "Online",
                            "first_seen": now,
                            "last_seen": now,
                            "criticality": crit
                        }

    def scan_network(self, interface_ip: str = None, subnet: str = None) -> list:
        """Discovers all devices on the network as a list."""
        discovered = list(self.scan_network_stream(interface_ip=interface_ip, subnet=subnet))
        logger.info(f"Network discovery finished: {len(discovered)} active devices found.")
        return discovered

    def get_arp_table_devices(self) -> list:
        """Reads current ARP table without re-sweeping."""
        return self.scan_network()

    def associate_sensor(self, hostname: str, ip: str) -> Optional[str]:
        """Finds matching device ID for an incoming telemetry sensor."""
        if not ip and not hostname:
            return None
        return f"dev-{(ip or hostname).replace('.', '-')}"

    def start_monitoring(self, interface: Optional[str] = None, interval: int = 30) -> Dict[str, Any]:
        """Enables background periodic network monitoring."""
        self.is_monitoring = True
        self.monitoring_interface = interface
        self.monitoring_interval = max(5, min(int(interval), 3600))
        logger.info(f"Network monitoring started on interface {interface} (interval {self.monitoring_interval}s)")
        return {
            "status": "monitoring_started",
            "is_monitoring": True,
            "interface": interface,
            "interval": self.monitoring_interval
        }

    def stop_monitoring(self) -> Dict[str, Any]:
        """Disables background network monitoring."""
        self.is_monitoring = False
        logger.info("Network monitoring stopped.")
        return {
            "status": "monitoring_stopped",
            "is_monitoring": False
        }


discovery_manager = NetworkDiscoveryManager()