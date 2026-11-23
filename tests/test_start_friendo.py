import importlib.util
from pathlib import Path
import socket
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('start_friendo', Path(__file__).resolve().parents[1] / 'scripts/start-friendo.py')
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class PortTests(unittest.TestCase):
    def test_pulls_both_repositories_as_their_owner(self):
        with patch.object(launcher.Path, 'stat', return_value=SimpleNamespace(st_uid=1000)), \
                patch.object(launcher.os, 'geteuid', return_value=0), \
                patch.object(launcher.pwd, 'getpwuid', return_value=SimpleNamespace(pw_name='alex')), \
                patch.object(launcher.subprocess, 'check_output', side_effect=['', '']), \
                patch.object(launcher.subprocess, 'run') as run:
            launcher.pull_sources()
            self.assertEqual([call.args[0] for call in run.call_args_list], [
                ['runuser', '-u', 'alex', '--', 'git', '-C', str(repository), 'pull', '--ff-only']
                for repository in [launcher.ROOT, launcher.ROOT.parent / 'proiect-de-curs-frontend']
            ])

    def test_dirty_frontend_prevents_pulling_either_repository(self):
        with patch.object(launcher.Path, 'stat', return_value=SimpleNamespace(st_uid=1000)), \
                patch.object(launcher.os, 'geteuid', return_value=1000), \
                patch.object(launcher.subprocess, 'check_output', side_effect=['', ' M src/app.tsx']), \
                patch.object(launcher.subprocess, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'tracked local changes'):
                launcher.pull_sources()
            run.assert_not_called()

    def test_failed_pull_does_not_build_or_stop_the_app(self):
        with patch.object(launcher.sys, 'argv', ['start-friendo.py']), \
                patch.object(launcher.Path, 'is_file', return_value=True), \
                patch.object(launcher.os, 'chdir'), \
                patch.object(launcher, 'pull_sources', side_effect=RuntimeError('pull failed')), \
                patch.object(launcher.subprocess, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'pull failed'):
                launcher.main()
            run.assert_not_called()

    def test_selects_preferred_free_pair(self):
        with patch.object(launcher.socket, 'socket'):
            self.assertEqual(launcher.find_pair(5000), (5000, 5001))

    def test_skips_docker_reserved_backend(self):
        with patch.object(launcher.socket, 'socket'):
            self.assertEqual(launcher.find_pair(5000, {5000}), (5001, 5002))
            self.assertEqual(launcher.find_pair(5000, {5001}), (5002, 5003))

    def test_skips_pair_with_real_busy_socket(self):
        with socket.socket() as busy:
            for port in range(20000, 40000, 1000):
                try:
                    busy.bind(('127.0.0.1', port))
                    break
                except OSError:
                    continue
            else:
                self.fail('Unable to reserve a local test port')
            chosen = launcher.find_pair(port)
            self.assertGreaterEqual(chosen[0], port + 1)
            self.assertEqual(chosen[1], chosen[0] + 1)

    def test_reports_exhausted_range(self):
        with self.assertRaisesRegex(RuntimeError, 'No available'):
            launcher.find_pair(65534, {65535})

    def test_reads_docker_nat_reservations(self):
        with patch.object(launcher.subprocess, 'check_output', side_effect=[
            'container-id\n',
            '[{"NetworkSettings":{"Ports":{"80/tcp":[{"HostPort":"5000"}],"5432/tcp":null}}}]',
        ]):
            self.assertEqual(launcher.docker_reserved_ports(), {5000})

    def test_startup_passes_selected_ports_to_compose(self):
        with patch.object(launcher.sys, 'argv', ['start-friendo.py']), \
                patch.object(launcher.Path, 'is_file', return_value=True), \
                patch.object(launcher.os, 'chdir'), \
                patch.object(launcher, 'pull_sources'), \
                patch.object(launcher, 'docker_reserved_ports', return_value={5000}), \
                patch.object(launcher, 'find_pair', return_value=(5001, 5002)) as select, \
                patch.object(launcher, 'start_tunnel') as tunnel, \
                patch.object(launcher.subprocess, 'run') as run, \
                patch('builtins.print'):
            launcher.main()
            commands = [call.args[0] for call in run.call_args_list]
            self.assertLess(
                commands.index(['docker', 'compose', 'build', 'migrate', 'api', 'frontend']),
                commands.index(['docker', 'compose', 'stop', 'frontend', 'api']),
            )
            select.assert_called_once_with(5000, {5000})
            up = next(call for call in run.call_args_list if call.args[0] == ['docker', 'compose', 'up', '-d'])
            self.assertEqual(up.kwargs['env']['FRONTEND_PORT'], '5001')
            self.assertEqual(up.kwargs['env']['BACKEND_PORT'], '5002')
            tunnel.assert_called_once_with(5001)

    def test_failed_build_keeps_running_application_and_tunnel_untouched(self):
        build = ['docker', 'compose', 'build', 'migrate', 'api', 'frontend']
        with patch.object(launcher.sys, 'argv', ['start-friendo.py']), \
                patch.object(launcher.Path, 'is_file', return_value=True), \
                patch.object(launcher.os, 'chdir'), \
                patch.object(launcher, 'pull_sources'), \
                patch.object(launcher, 'start_tunnel') as tunnel, \
                patch.object(launcher.subprocess, 'run', side_effect=[
                    None, launcher.subprocess.CalledProcessError(1, build),
                ]) as run:
            with self.assertRaises(launcher.subprocess.CalledProcessError):
                launcher.main()
            self.assertEqual([call.args[0] for call in run.call_args_list], [
                ['docker', 'compose', 'config', '--quiet'], build,
            ])
            tunnel.assert_not_called()

    def test_tunnel_uses_selected_frontend_port_and_a_separate_service(self):
        with patch.object(launcher.shutil, 'which', return_value='/usr/bin/cloudflared'), \
                patch.object(launcher.subprocess, 'run') as run, \
                patch.object(launcher, 'wait_tunnel_url', return_value='https://new-tunnel.trycloudflare.com'), \
                patch('builtins.print') as output:
            launcher.start_tunnel(5003)
            output.assert_any_call('Public website: https://new-tunnel.trycloudflare.com', flush=True)
        self.assertEqual(run.call_args_list[0].args[0], ['systemctl', 'stop', 'friendo-tunnel.service'])
        command = run.call_args_list[1].args[0]
        self.assertEqual(command[0], 'systemd-run')
        self.assertIn('--unit=friendo-tunnel.service', command)
        self.assertIn('--property=Restart=on-failure', command)
        self.assertEqual(command[-4:], ['/usr/bin/cloudflared', 'tunnel', '--url', 'http://127.0.0.1:5003'])

    def test_missing_cloudflared_keeps_app_running(self):
        with patch.object(launcher.shutil, 'which', return_value=None), \
                patch.object(launcher.subprocess, 'run') as run, \
                patch('builtins.print'):
            launcher.start_tunnel(5000)
            run.assert_not_called()

    def test_waits_for_url_from_current_invocation(self):
        invocation = 'a' * 32
        with patch.object(launcher.subprocess, 'check_output', side_effect=[
                invocation + '\n', 'Connecting...',
                'Visit https://new-tunnel.trycloudflare.com to access your tunnel',
        ]) as read, patch.object(launcher.time, 'sleep'):
            self.assertEqual(launcher.wait_tunnel_url(), 'https://new-tunnel.trycloudflare.com')
        self.assertIn('_SYSTEMD_INVOCATION_ID=' + invocation, read.call_args.args[0])

    def test_does_not_read_old_logs_when_invocation_is_missing(self):
        with patch.object(launcher.subprocess, 'check_output', return_value='') as read:
            self.assertIsNone(launcher.wait_tunnel_url())
            self.assertEqual(read.call_count, 1)

    def test_url_wait_has_a_deadline(self):
        with patch.object(launcher.subprocess, 'check_output', return_value='a' * 32) as read, \
                patch.object(launcher.time, 'monotonic', side_effect=[0, 31]):
            self.assertIsNone(launcher.wait_tunnel_url())
            self.assertEqual(read.call_count, 1)

    def test_journal_failure_keeps_app_running_and_prints_fallback(self):
        with patch.object(launcher.shutil, 'which', return_value='/usr/bin/cloudflared'), \
                patch.object(launcher.subprocess, 'run'), \
                patch.object(launcher.subprocess, 'check_output', side_effect=OSError('journal unavailable')), \
                patch('builtins.print') as output:
            launcher.start_tunnel(5000)
        self.assertTrue(any('Find the public URL:' in str(call) for call in output.call_args_list))

    def test_tunnel_start_failure_does_not_stop_app(self):
        with patch.object(launcher.shutil, 'which', return_value='/usr/bin/cloudflared'), \
                patch.object(launcher.subprocess, 'run', side_effect=[None, launcher.subprocess.CalledProcessError(1, 'systemd-run')]), \
                patch('builtins.print'):
            launcher.start_tunnel(5000)


if __name__ == '__main__':
    unittest.main()
