"""Refuse URLs that point into this machine or its network (SSRF guard for the browser and audits)."""
from __future__ import annotations

import ipaddress
import socket
from functools import lru_cache
from urllib.parse import urlparse


class BlockedURL(ValueError):
    pass


@lru_cache(maxsize=512)
def _host_is_public(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            return False
    return True


def check_url(url: str) -> str:
    url = (url or "").strip()
    if url and "://" not in url:
        url = "https://" + url
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise BlockedURL("Nur http- und https-Adressen sind erlaubt.")
    if not _host_is_public(parsed.hostname):
        raise BlockedURL(f"{parsed.hostname} ist keine öffentliche Adresse; lokale oder interne Ziele öffne ich nicht.")
    return url


def is_allowed_request(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme in ("data", "blob", "about"):
        return True
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    return _host_is_public(parsed.hostname)
