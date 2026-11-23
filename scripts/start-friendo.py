#!/usr/bin/env python3
"""Start Friendo on paired host ports: 5000/5001, then 5001/5002, etc."""
import argparse
import json
import os
from pathlib import Path
import re
import socket
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent.parent
TUNNEL_UNIT = 'friendo-tunnel.service'


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


def wait_tunnel_url(timeout=30):
    deadline = time.monotonic() + timeout
    try:
        # Read only this service invocation, never URLs from earlier launches.
        invocation = subprocess.check_output([
            'systemctl', 'show', TUNNEL_UNIT, '--property=InvocationID', '--value',
        ], text=True, timeout=3).strip()
        if not re.fullmatch(r'[0-9a-f]{32}', invocation):
            return None
        while time.monotonic() < deadline:
            logs = subprocess.check_output([
                'journalctl', '-b', '--no-pager', '-o', 'cat',
                '_SYSTEMD_INVOCATION_ID=' + invocation,
            ], text=True, timeout=max(0.1, min(3, deadline - time.monotonic())))
            urls = re.findall(r'https://[a-z0-9-]+\.trycloudflare\.com\b', logs)
            if urls:
                return urls[-1]
            time.sleep(max(0, min(1, deadline - time.monotonic())))
    except (OSError, subprocess.SubprocessError):
        return None
    return None


def start_tunnel(frontend):
    cloudflared = shutil.which('cloudflared')
    if not cloudflared:
        print('App is running; install cloudflared to enable the public tunnel.', file=sys.stderr)
        return
    # A separate systemd unit survives logout and the end of the boot launcher.
    # Restart only our own tunnel, leaving other Cloudflare services untouched.
    subprocess.run(['systemctl', 'stop', TUNNEL_UNIT], check=False,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        subprocess.run([
            'systemd-run', '--unit=' + TUNNEL_UNIT, '--collect',
            '--property=Restart=on-failure', '--property=RestartSec=5',
            '--', cloudflared, 'tunnel', '--url', f'http://127.0.0.1:{frontend}',
        ], check=True)
    except subprocess.CalledProcessError:
        print('App is running, but its Cloudflare tunnel could not start. Check systemd logs.', file=sys.stderr)
        return
    print('Public tunnel started in the background. Its temporary URL may change after restart.')
    print('Waiting up to 30 seconds for the public URL...', flush=True)
    url = wait_tunnel_url()
    if url:
        print(f'Public website: {url}', flush=True)
        return
    print('The public URL is not available yet. Check the tunnel logs for connection errors.', file=sys.stderr)
    print('Find the public URL: sudo journalctl -u friendo-tunnel -b --no-pager -o cat | '
          "grep -oE 'https://[a-z0-9-]+\\.trycloudflare\\.com' | tail -1")


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
    start_tunnel(frontend)
    print('Use this script again to select ports; existing containers retain their ports across reboots.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print(f'Friendo startup failed: {error}', file=sys.stderr)
        sys.exit(1)
