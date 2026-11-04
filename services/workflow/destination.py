"""Request-time destination check for model endpoints a user may configure (SSRF).

The saved Base URL is only checked for syntax; here, before every request, the host is resolved, every address must be
public, and the connection goes to an address that was checked (TLS still verifies the original host name), so a second
DNS answer cannot point it somewhere else. Redirects are never followed.

LLM_FAKE_IP_CIDR (e.g. 198.18.0.0/15) accepts a local proxy's fake-IP range: such proxies answer every name with an
address from it and choose the real destination themselves. Leave it unset where no such proxy runs."""
import ipaddress
import os
import socket
from urllib.parse import urlsplit, urlunsplit

import httpx

from services.workflow.providers import ProviderError


def _unsafe(stage):
    return ProviderError(stage, 'unsafe_destination', 'Model endpoint does not resolve to a public address')


def _allowed_ranges(env):
    value = (env.get('LLM_FAKE_IP_CIDR') or '').strip()
    if not value: return []
    try: return [ipaddress.ip_network(part.strip()) for part in value.split(',') if part.strip()]
    except ValueError: raise ProviderError('config', 'invalid_setting', 'LLM_FAKE_IP_CIDR') from None


def public_address(text, allowed=()):
    address = ipaddress.ip_address(text.split('%', 1)[0])
    if address.version == 6 and address.ipv4_mapped: address = address.ipv4_mapped
    return address.is_global or any(address in network for network in allowed)


def checked_address(host, port, *, stage='manuscript', resolve=None, env=None):
    """The first resolved address of host, after every resolved address passed the check."""
    resolve = resolve or socket.getaddrinfo
    allowed = _allowed_ranges(os.environ if env is None else env)
    try: answers = resolve(host, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError): raise ProviderError(stage, 'transport_error', 'Model endpoint did not resolve') from None
    addresses = [answer[4][0] for answer in answers]
    if not addresses or not all(public_address(a, allowed) for a in addresses): raise _unsafe(stage)
    return addresses[0]


def pinned_post(client, url, *, headers, json, stage='manuscript', resolve=None, env=None):
    """POST to url through a checked address; certificate and Host header stay on the original host name.
    The client must not use HTTP_PROXY / HTTPS_PROXY (httpx.Client(trust_env=False)): a proxy resolves the name itself,
    which would bypass the check."""
    if isinstance(client, httpx.Client) and client.trust_env:
        raise ProviderError('config', 'invalid_setting', 'Model requests must not go through an environment proxy')
    parts = urlsplit(url)
    if parts.scheme != 'https' or not parts.hostname: raise _unsafe(stage)
    host, port = parts.hostname, parts.port or 443
    address = checked_address(host, port, stage=stage, resolve=resolve, env=env)
    netloc = ('[' + address + ']' if ':' in address else address) + ('' if port == 443 else f':{port}')
    pinned = urlunsplit(('https', netloc, parts.path, parts.query, ''))
    host_header = host if port == 443 else f'{host}:{port}'
    return client.post(pinned, follow_redirects=False, headers={**headers, 'Host': host_header}, json=json,
                       extensions={'sni_hostname': host})
