import importlib.util
from pathlib import Path
import socket
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('start_friendo', Path(__file__).resolve().parents[1] / 'scripts/start-friendo.py')
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class PortTests(unittest.TestCase):
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
                patch.object(launcher, 'docker_reserved_ports', return_value={5000}), \
                patch.object(launcher, 'find_pair', return_value=(5001, 5002)) as select, \
                patch.object(launcher.subprocess, 'run') as run, \
                patch('builtins.print'):
            launcher.main()
            select.assert_called_once_with(5000, {5000})
            up = next(call for call in run.call_args_list if call.args[0] == ['docker', 'compose', 'up', '-d'])
            self.assertEqual(up.kwargs['env']['FRONTEND_PORT'], '5001')
            self.assertEqual(up.kwargs['env']['BACKEND_PORT'], '5002')


if __name__ == '__main__':
    unittest.main()
