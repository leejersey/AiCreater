"""Authentication routes and a single deny-by-default resource dependency."""
from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from services.accounts.auth import COOKIE, SESSION_SECONDS
from services.projects.store import StoreError


class Credentials(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)
    username:str=Field(min_length=3,max_length=32)
    password:str=Field(min_length=1,max_length=128)


class PasswordChange(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)
    current_password:str=Field(min_length=6,max_length=128)
    new_password:str=Field(min_length=6,max_length=128)


class Empty(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)


def access(request:Request):
    if not request.app.state.authentication: return
    if request.url.path=='/health': return
    if request.method not in ('GET','HEAD','OPTIONS') and request.headers.get('content-type','').split(';')[0]!='application/json':
        raise StoreError('content_type','写入请求必须为JSON')
    if request.url.path in ('/api/auth/register','/api/auth/login'): return
    user=request.app.state.accounts.current(request.cookies.get(COOKIE))
    request.state.user=user
    request.app.state.accounts.authorize(user['id'],request.path_params)


def set_session(response,token):
    # HTTP cookie is intentional only for the existing loopback-only development service.
    response.set_cookie(COOKIE,token,max_age=SESSION_SECONDS,httponly=True,samesite='strict',secure=False,path='/')


router=APIRouter(prefix='/api/auth')

@router.post('/register',status_code=201)
def register(body:Credentials,request:Request,response:Response):
    user,token=request.app.state.accounts.register(body.username,body.password,request.client.host)
    set_session(response,token)
    return user

@router.post('/login')
def login(body:Credentials,request:Request,response:Response):
    user,token=request.app.state.accounts.login(body.username,body.password,request.client.host)
    set_session(response,token)
    return user

@router.get('/me')
def me(request:Request):
    return request.state.user

@router.post('/logout')
def logout(body:Empty,request:Request,response:Response):
    request.app.state.accounts.logout(request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE,path='/',httponly=True,samesite='strict')
    return {'status':'signed_out'}

@router.post('/password')
def password(body:PasswordChange,request:Request,response:Response):
    token=request.app.state.accounts.change_password(request.state.user['id'],body.current_password,body.new_password,request.client.host)
    set_session(response,token)
    return request.state.user
