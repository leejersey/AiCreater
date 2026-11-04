"""Local configuration, read by every entry point so no shell has to source anything: .env.local-services (database)
and .env (provider keys, object storage). Values already set in the environment win."""
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]


def load_local_config():
    for name in ('.env.local-services', '.env'):
        load_dotenv(ROOT / name, override=False)
