#!/usr/bin/env python3
"""Start Friendo on paired host ports: 5000/5001, then 5001/5002, etc."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent


def find_pair(start, reserved=()):
    for frontend in range(start, 65535):
        backend = frontend + 1
        if frontend in reserved or backend in reserved:
            continue
        sockets = []
        try:
            for port in (frontend, backend):
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sockets.append(sock)
                sock.bind(('127.0.0.1', port))
            return frontend, backend
        except OSError:
            continue
        finally:
            for sock in sockets:
                sock.close()
    raise RuntimeError('No available port pair found')


def docker_reserved_ports():
    # Docker can reserve ports through NAT even when no socket listener is visible.
    ids = subprocess.check_output(['docker', 'ps', '-q'], text=True).split()
    if not ids:
        return set()
    containers = json.loads(subprocess.check_output(['docker', 'inspect', *ids], text=True))
    return {int(binding['HostPort']) for container in containers
            for bindings in (container.get('NetworkSettings', {}).get('Ports') or {}).values()
            for binding in (bindings or []) if binding.get('HostPort')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('base', type=int, nargs='?', default=5000,
                        help='preferred frontend port (default: 5000)')
    args = parser.parse_args()
    if not 1 <= args.base <= 65534:
        parser.error('base must be between 1 and 65534')
    if not (ROOT / '.env').is_file():
        raise RuntimeError('Configure the backend .env before starting Friendo')
    os.chdir(ROOT)
    # Validate configuration before stopping the current application.
    subprocess.run(['docker', 'compose', 'config', '--quiet'], check=True)
    subprocess.run(['docker', 'compose', 'stop', 'frontend', 'api'], check=True)
    frontend, backend = find_pair(args.base, docker_reserved_ports())
    env = {**os.environ, 'FRONTEND_PORT': str(frontend), 'BACKEND_PORT': str(backend)}
    print(f'Starting frontend on {frontend}, backend on {backend}', flush=True)
    subprocess.run(['docker', 'compose', 'up', '-d'], env=env, check=True)
    # Nginx resolves the API container address at startup; refresh after recreation.
    subprocess.run(['docker', 'compose', 'restart', 'frontend'], env=env, check=True)
    subprocess.run(['docker', 'compose', 'ps'], env=env, check=True)
    print(f'Frontend: http://127.0.0.1:{frontend}/')
    print(f'Backend:  http://127.0.0.1:{backend}/api/hf/user (403 without a token is expected)')
    print(f'Cloudflare Tunnel origin: http://127.0.0.1:{frontend}')
    print('Use this script again to select ports; existing containers retain their ports across reboots.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print(f'Friendo startup failed: {error}', file=sys.stderr)
        sys.exit(1)
