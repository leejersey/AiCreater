"""Database-backed local sessions and immutable project ownership."""
import hashlib
import hmac
import re
import secrets
import uuid

from services.projects.store import StoreError, identifier

COOKIE = 'aicreater_session'
SESSION_SECONDS = 7 * 24 * 3600


def username(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-zA-Z0-9_]{3,32}', value):
        raise StoreError('validation', '用户名需为3–32位英文字母、数字或下划线')
    return value.lower()


def valid_password(value):
    if not isinstance(value, str) or not 6 <= len(value) <= 128 or '\x00' in value:
        raise StoreError('validation', '密码需为6–128个字符')
    try: value.encode('utf-8')
    except UnicodeError: raise StoreError('validation', '密码包含无效字符') from None


def password_hash(value):
    valid_password(value)
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(value.encode('utf-8'), salt=salt, n=32768, r=8, p=3, maxmem=64*1024**2, dklen=32)
    return 'scrypt$' + salt.hex() + '$' + digest.hex()


def password_matches(value, encoded):
    # Use the same work factor for unknown accounts; do not reveal username existence by skipping the hash.
    salt, expected = (encoded or ('scrypt$' + '0'*32 + '$' + '0'*64)).split('$')[1:]
    digest = hashlib.scrypt(value.encode('utf-8'), salt=bytes.fromhex(salt), n=32768, r=8, p=3, maxmem=64*1024**2, dklen=32)
    return hmac.compare_digest(digest.hex(), expected)


def token_hash(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


class Accounts:
    def __init__(self, store): self.store = store

    def limit(self, key, maximum):
        with self.store.connection() as conn:
            conn.execute('DELETE FROM auth_limits WHERE expires_at<=now()')
            row = conn.execute("""INSERT INTO auth_limits(key,attempts,expires_at) VALUES(%s,1,now()+interval '15 minutes')
                ON CONFLICT(key) DO UPDATE SET attempts=auth_limits.attempts+1 RETURNING attempts""",[key]).fetchone()
        if row['attempts'] > maximum: raise StoreError('rate_limit', '尝试过于频繁，请15分钟后重试')

    def throttle(self, peer, action, name):
        self.limit('peer:' + peer, 300)
        self.limit(action + ':' + (peer if action=='register' else name), 30 if action=='register' else 10)

    def _session(self, conn, user_id):
        token = secrets.token_urlsafe(32)
        conn.execute('DELETE FROM user_sessions WHERE expires_at<=now()')
        conn.execute("INSERT INTO user_sessions(token_hash,user_id,expires_at) VALUES(%s,%s,now()+interval '7 days')",
                     [token_hash(token), user_id])
        return token

    def register(self, name, password, peer):
        name = username(name); valid_password(password)
        self.throttle(peer,'register',name)
        encoded = password_hash(password)
        with self.store.connection() as conn:
            row = conn.execute('INSERT INTO users(id,username,password_hash) VALUES(%s,%s,%s) ON CONFLICT(username) DO NOTHING RETURNING id,username',
                               [str(uuid.uuid4()),name,encoded]).fetchone()
            if not row: raise StoreError('conflict', '用户名不可用，请换一个')
            token = self._session(conn,row['id'])
            return {'id':str(row['id']),'username':row['username']}, token

    def login(self, name, password, peer):
        name = username(name)
        if not isinstance(password,str) or not 1 <= len(password) <= 128: raise StoreError('unauthorized','用户名或密码错误')
        try: password.encode('utf-8')
        except UnicodeError: raise StoreError('unauthorized','用户名或密码错误') from None
        self.throttle(peer,'login',name)
        # Lock serializes login with password change, so an old password cannot mint a post-reset session.
        with self.store.connection() as conn:
            row = conn.execute('SELECT * FROM users WHERE username=%s FOR UPDATE',[name]).fetchone()
            if not password_matches(password,row['password_hash'] if row else None):
                raise StoreError('unauthorized','用户名或密码错误')
            token = self._session(conn,row['id'])
            return {'id':str(row['id']),'username':row['username']}, token

    def current(self, token):
        if not isinstance(token,str) or not re.fullmatch('[A-Za-z0-9_-]{43}',token):
            raise StoreError('unauthorized','请登录后继续，当前输入不会自动重发')
        with self.store.connection() as conn:
            row = conn.execute('SELECT u.id,u.username FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=%s AND s.expires_at>now()',
                               [token_hash(token)]).fetchone()
        if not row: raise StoreError('unauthorized','登录已过期，请重新登录；当前输入不会自动重发')
        return {'id':str(row['id']),'username':row['username']}

    def logout(self, token):
        if token:
            with self.store.connection() as conn: conn.execute('DELETE FROM user_sessions WHERE token_hash=%s',[token_hash(token)])

    def change_password(self, user_id, current, new, peer):
        valid_password(current); valid_password(new)
        self.throttle(peer,'password',user_id)
        encoded = password_hash(new)
        with self.store.connection() as conn:
            row = conn.execute('SELECT password_hash FROM users WHERE id=%s FOR UPDATE',[identifier(user_id)]).fetchone()
            if not row or not password_matches(current,row['password_hash']):
                raise StoreError('unauthorized','当前密码错误')
            conn.execute('UPDATE users SET password_hash=%s WHERE id=%s',[encoded,user_id])
            conn.execute('DELETE FROM user_sessions WHERE user_id=%s',[user_id])
            return self._session(conn,user_id)

    def authorize(self, user_id, params):
        # Identifiers come only from the framework's matched route; SQL names are a fixed allowlist.
        tables = {'project_id':('projects','id'), 'scene_id':('scenes','project_id'),
                  'version_id':('project_versions','project_id'), 'job_id':('jobs','project_id'),
                  'candidate_id':('scene_candidates','scene_id')}
        with self.store.connection() as conn:
            for key,(table,column) in tables.items():
                if key not in params: continue
                try: value=identifier(params[key])
                except StoreError: raise StoreError('not_found','资源不存在') from None
                if key=='project_id':
                    query='SELECT 1 FROM projects WHERE id=%s AND owner_id=%s'
                elif key=='candidate_id':
                    query='SELECT 1 FROM scene_candidates r JOIN scenes s ON s.id=r.scene_id JOIN projects p ON p.id=s.project_id WHERE r.id=%s AND p.owner_id=%s'
                else:
                    query=f'SELECT 1 FROM {table} r JOIN projects p ON p.id=r.{column} WHERE r.id=%s AND p.owner_id=%s'
                if not conn.execute(query,[value,user_id]).fetchone(): raise StoreError('not_found','资源不存在')

    def claim(self, name, project_ids):
        name=username(name)
        if not project_ids or len(set(project_ids))!=len(project_ids): raise ValueError('Explicit unique project IDs required')
        count=0
        with self.store.connection() as conn:
            user=conn.execute('SELECT id FROM users WHERE username=%s',[name]).fetchone()
            if not user: raise ValueError('User not found')
            for pid in sorted(project_ids):
                row=conn.execute('SELECT owner_id FROM projects WHERE id=%s FOR UPDATE',[identifier(pid)]).fetchone()
                if not row or row['owner_id'] not in (None,user['id']): raise ValueError('Project missing or already owned by another user')
                if row['owner_id'] is None:
                    conn.execute('UPDATE projects SET owner_id=%s WHERE id=%s',[user['id'],pid]);count+=1
        return count

    def reset_password(self, name, password):
        name=username(name);encoded=password_hash(password)
        with self.store.connection() as conn:
            row=conn.execute('UPDATE users SET password_hash=%s WHERE username=%s RETURNING id',[encoded,name]).fetchone()
            if not row: raise ValueError('User not found')
            conn.execute('DELETE FROM user_sessions WHERE user_id=%s',[row['id']])
