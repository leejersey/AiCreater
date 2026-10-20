"""Explicit local maintenance only; no HTTP ownership/password-reset backdoor."""
import argparse
import getpass
import os
from dotenv import load_dotenv
from services.accounts.auth import Accounts
from services.projects.manage import profile
from services.projects.store import Store, StoreError
from services.workflow.storyboard import ROOT


def main():
    parser=argparse.ArgumentParser(description='Local account maintenance; back up original database before claiming courses')
    parser.add_argument('action',choices=['claim','reset-password'])
    parser.add_argument('--username',required=True)
    parser.add_argument('--project',action='append',default=[])
    parser.add_argument('--confirm',action='store_true',help='Explicitly authorize this maintenance operation')
    args=parser.parse_args()
    if not args.confirm: parser.error('Requires --confirm; no changes made')
    if (args.action=='claim') != bool(args.project): parser.error('claim requires explicit --project IDs; reset-password accepts none')
    load_dotenv(ROOT/'.env',override=False)
    dsn=os.getenv('DATABASE_URL')
    if not dsn: parser.error('DATABASE_URL must be configured locally')
    accounts=Accounts(Store(dsn,ROOT/'apps/renderer/public',profile()))
    try:
        if args.action=='claim': print(f'Claimed {accounts.claim(args.username,args.project)} explicitly selected courses')
        else:
            password=getpass.getpass('New password (6–128 characters): ')
            if password!=getpass.getpass('Repeat password: '): parser.error('Passwords differ; no changes made')
            accounts.reset_password(args.username,password)
            print('Password reset; all previous sessions revoked')
    except (StoreError,ValueError) as error: parser.exit(1,str(error)+'\n')


if __name__=='__main__': main()
