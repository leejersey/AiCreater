"""Account-owned image credentials. Configuration only: never calls a provider."""
import ipaddress
import os
import re
from urllib.parse import urlsplit, urlunsplit

from cryptography.fernet import Fernet, InvalidToken
from services.projects.store import StoreError, identifier

DEFAULT_BASE_URL = 'https://api.openai.com/v1'


def cipher():
    try:
        return Fernet(os.environ.get('ACCOUNT_CREDENTIALS_KEY', '').encode('ascii'))
    except (ValueError, UnicodeError):
        raise StoreError('storage', '服务端尚未配置有效的 ACCOUNT_CREDENTIALS_KEY，暂不能保存密钥') from None


def validate_base_url(value):
    invalid = 'Base URL 仅支持不含凭据、查询参数或片段的公网 HTTPS 地址'
    if not isinstance(value, str) or len(value) > 2048:
        raise StoreError('validation', invalid)
    value = value.strip()
    if any(c.isspace() or ord(c) < 33 or ord(c) == 127 for c in value) or re.search(r'%[01][0-9a-f]|%7f', value, re.I) or any(c in value for c in '\\?#'):
        raise StoreError('validation', invalid)
    try:
        url = urlsplit(value)
        host = (url.hostname or '').encode('idna').decode('ascii').lower().rstrip('.')
        port = url.port
        if url.scheme != 'https' or not host or url.username is not None or url.password is not None or '%' in host or port == 0:
            raise ValueError()
        if host == 'localhost' or host.endswith(('.localhost', '.local', '.internal')):
            raise ValueError()
        try:
            literal = ipaddress.ip_address(host)
        except ValueError:
            literal = None
        if literal is not None and not literal.is_global:
            raise ValueError()
    except (ValueError, UnicodeError):
        raise StoreError('validation', invalid) from None
    authority = '[' + host + ']' if ':' in host else host
    if port is not None and port != 443:
        authority += ':' + str(port)
    # Configuration only; enforce destination safety at request time before adding generation.
    return urlunsplit(('https', authority, url.path.rstrip('/'), '', ''))


class ImageSettings:
    def __init__(self, store):
        self.store = store

    def get(self, user_id):
        with self.store.connection() as conn:
            row = conn.execute('SELECT base_url FROM user_image_settings WHERE user_id=%s', [identifier(user_id)]).fetchone()
        return {'configured': bool(row), 'base_url': row['base_url'] if row else DEFAULT_BASE_URL}

    def save(self, user_id, base_url, api_key):
        user_id = identifier(user_id)
        if not isinstance(api_key, str) or len(api_key) > 2048 or (api_key and (not api_key.isascii() or any(ord(c) < 33 or ord(c) > 126 for c in api_key))):
            raise StoreError('validation', 'API Key 需为不含空格或控制字符的有效密钥，最多2048字符')
        base_url = validate_base_url(base_url)
        encryption = cipher()
        with self.store.connection() as conn:
            # Serialize first-save, replace and delete even when no settings row exists yet.
            conn.execute('SELECT id FROM users WHERE id=%s FOR UPDATE', [user_id])
            row = conn.execute('SELECT * FROM user_image_settings WHERE user_id=%s', [user_id]).fetchone()
            if not api_key:
                if not row or row['base_url'] != base_url:
                    raise StoreError('validation', '首次配置或更换 Base URL 时必须填写新的 API Key')
                try:
                    encryption.decrypt(row['encrypted_api_key'].encode('ascii'))
                except (InvalidToken, ValueError, UnicodeError):
                    raise StoreError('storage', '已保存密钥无法解密，请检查服务端加密配置或重新填写 API Key') from None
            else:
                encrypted = encryption.encrypt(api_key.encode('ascii')).decode('ascii')
                conn.execute('''INSERT INTO user_image_settings(user_id,base_url,encrypted_api_key) VALUES(%s,%s,%s)
                    ON CONFLICT(user_id) DO UPDATE SET base_url=excluded.base_url,
                    encrypted_api_key=excluded.encrypted_api_key,updated_at=now()''', [user_id, base_url, encrypted])
        return {'configured': True, 'base_url': base_url}

    def clear(self, user_id):
        with self.store.connection() as conn:
            conn.execute('SELECT id FROM users WHERE id=%s FOR UPDATE', [identifier(user_id)])
            conn.execute('DELETE FROM user_image_settings WHERE user_id=%s', [user_id])
        return {'configured': False, 'base_url': DEFAULT_BASE_URL}
