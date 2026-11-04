"""Account-owned model settings: an OpenAI-compatible Base URL, API Key and model ID. Saving never calls a provider;
every request to the saved URL goes through services.workflow.destination. resolve_llm picks the account's settings
or, without them, the server's DeepSeek key."""
import ipaddress
import os
import re
from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit

from cryptography.fernet import Fernet, InvalidToken
from services.projects.store import StoreError, identifier

DEEPSEEK_BASE_URL = 'https://api.deepseek.com'  # also the baseUrl of the DeepSeek entries in packages/scene-agent/models.json
DEFAULT_MODEL = 'deepseek-flash'
MODEL = re.compile(r'[\x21-\x7e]{1,200}')


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
    # Syntax only; services.workflow.destination checks where it resolves at request time.
    return urlunsplit(('https', authority, url.path.rstrip('/'), '', ''))


@dataclass(frozen=True)
class LLM:
    base_url: str
    api_key: str
    model: str
    source: str           # 'account' | 'env'
    version: str | None   # the account row's updated_at; None for env

    def public(self):
        """What a job freezes and shows: never the key."""
        return {'source': self.source, 'base_url': self.base_url, 'model': self.model, 'version': self.version}


def resolve_llm(store, user_id, env=None):
    """The account's model settings if it has a readable row, else the server's DeepSeek settings."""
    env = os.environ if env is None else env
    if user_id:
        with store.connection() as conn:
            row = conn.execute('SELECT * FROM user_model_settings WHERE user_id=%s', [identifier(user_id)]).fetchone()
        if row:
            try:
                key = cipher().decrypt(row['encrypted_api_key'].encode('ascii')).decode('ascii')
                return LLM(row['base_url'], key, row['model'], 'account', row['updated_at'].isoformat())
            except (InvalidToken, ValueError, UnicodeError, StoreError):
                pass  # an unreadable row is treated as no row; the person can save it again
    return LLM(DEEPSEEK_BASE_URL, (env.get('DEEPSEEK_API_KEY') or '').strip(), (env.get('DEEPSEEK_MODEL') or '').strip() or DEFAULT_MODEL, 'env', None)


class ModelSettings:
    def __init__(self, store):
        self.store = store

    def get(self, user_id):
        with self.store.connection() as conn:
            row = conn.execute('SELECT base_url,model FROM user_model_settings WHERE user_id=%s', [identifier(user_id)]).fetchone()
        return {'configured': bool(row), 'base_url': row['base_url'] if row else DEEPSEEK_BASE_URL, 'model': row['model'] if row else DEFAULT_MODEL}

    def save(self, user_id, base_url, api_key, model):
        user_id = identifier(user_id)
        if not isinstance(api_key, str) or len(api_key) > 2048 or (api_key and (not api_key.isascii() or any(ord(c) < 33 or ord(c) > 126 for c in api_key))):
            raise StoreError('validation', 'API Key 需为不含空格或控制字符的有效密钥，最多2048字符')
        if not isinstance(model, str) or not MODEL.fullmatch(model.strip()):
            raise StoreError('validation', '模型 ID 需为 1–200 个可打印 ASCII 字符')
        model = model.strip()
        base_url = validate_base_url(base_url)
        encryption = cipher()
        with self.store.connection() as conn:
            # Serialize first-save, replace and delete even when no settings row exists yet.
            conn.execute('SELECT id FROM users WHERE id=%s FOR UPDATE', [user_id])
            row = conn.execute('SELECT * FROM user_model_settings WHERE user_id=%s', [user_id]).fetchone()
            if not api_key:
                if not row or row['base_url'] != base_url:
                    raise StoreError('validation', '首次配置或更换 Base URL 时必须填写新的 API Key')
                try:
                    encryption.decrypt(row['encrypted_api_key'].encode('ascii'))
                except (InvalidToken, ValueError, UnicodeError):
                    raise StoreError('storage', '已保存密钥无法解密，请检查服务端加密配置或重新填写 API Key') from None
                encrypted = row['encrypted_api_key']
            else:
                encrypted = encryption.encrypt(api_key.encode('ascii')).decode('ascii')
            # Every save moves updated_at: queued jobs froze the previous version and will not run with this one.
            conn.execute('''INSERT INTO user_model_settings(user_id,base_url,model,encrypted_api_key) VALUES(%s,%s,%s,%s)
                ON CONFLICT(user_id) DO UPDATE SET base_url=excluded.base_url,model=excluded.model,
                encrypted_api_key=excluded.encrypted_api_key,updated_at=clock_timestamp()''', [user_id, base_url, model, encrypted])
        return {'configured': True, 'base_url': base_url, 'model': model}

    def clear(self, user_id):
        with self.store.connection() as conn:
            conn.execute('SELECT id FROM users WHERE id=%s FOR UPDATE', [identifier(user_id)])
            conn.execute('DELETE FROM user_model_settings WHERE user_id=%s', [user_id])
        return {'configured': False, 'base_url': DEEPSEEK_BASE_URL, 'model': DEFAULT_MODEL}
