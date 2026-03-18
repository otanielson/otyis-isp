/**
 * Executa docker compose no diretório do tenant e retorna logs.
 */
import { spawn } from 'child_process';
import path from 'path';

export interface DockerComposeResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Executa docker compose com -f <composePath> para poder rodar de qualquer cwd.
 */
export function runDockerCompose(
  composeDir: string,
  args: string[]
): Promise<DockerComposeResult> {
  return new Promise((resolve) => {
    const composePath = path.join(path.resolve(composeDir), 'docker-compose.yml');
    const cmd = process.platform === 'win32' ? 'docker' : 'docker';
    const composeArgs = ['compose', '-f', composePath, ...args];
    const cwd = path.resolve(composeDir);

    const proc = spawn(cmd, composeArgs, {
      cwd,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code, signal) => {
      resolve({
        success: code === 0,
        stdout,
        stderr,
        code: code ?? (signal ? -1 : null),
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        stdout,
        stderr: stderr + (err?.message || String(err)),
        code: null,
      });
    });
  });
}

/**
 * Sobe o stack do tenant: docker compose up -d (todos os serviços).
 */
export function dockerComposeUp(composeDir: string): Promise<DockerComposeResult> {
  return runDockerCompose(composeDir, ['up', '-d']);
}

/**
 * Sobe apenas os serviços indicados. Se waitForHealthy for true, usa --wait
 * (espera o healthcheck do primeiro serviço, ex.: postgres).
 * Uso: 1) postgres com wait, 2) freeradius, 3) portal_admin e site.
 */
export function dockerComposeUpServices(
  composeDir: string,
  services: string[],
  waitForHealthy = false
): Promise<DockerComposeResult> {
  const args = ['up', '-d', ...(waitForHealthy ? ['--wait'] : []), ...services];
  return runDockerCompose(composeDir, args);
}

/**
 * Derruba o stack: docker compose down.
 */
export function dockerComposeDown(composeDir: string): Promise<DockerComposeResult> {
  return runDockerCompose(composeDir, ['down']);
}

/**
 * Obtém logs dos serviços do stack: docker compose logs --tail N <services...>.
 */
export function dockerComposeLogs(
  composeDir: string,
  services: string[],
  tail = 100
): Promise<DockerComposeResult> {
  const args = ['logs', '--tail', String(tail), ...services];
  return runDockerCompose(composeDir, args);
}

/**
 * Obtém logs de um container específico: docker logs <container> --tail N.
 * Mais confiável que docker compose logs em alguns ambientes.
 */
export function dockerLogs(containerName: string, tail = 100): Promise<DockerComposeResult> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'docker' : 'docker';
    const args = ['logs', containerName, '--tail', String(tail)];

    const proc = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        stdout,
        stderr,
        code,
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        stdout,
        stderr: stderr + (err?.message || String(err)),
        code: null,
      });
    });
  });
}

/**
 * Reinicia os serviços do stack: docker compose restart.
 */
export function dockerComposeRestart(composeDir: string, services?: string[]): Promise<DockerComposeResult> {
  const args = services && services.length > 0 ? ['restart', ...services] : ['restart'];
  return runDockerCompose(composeDir, args);
}

/**
 * Verifica se Docker está disponível (docker info ou docker compose version).
 */
export function checkDockerAvailable(): Promise<boolean> {
  return runDockerCompose(process.cwd(), ['version'])
    .then((r) => r.success)
    .catch(() => false);
}

export interface DockerContainerStatus {
  running: boolean;
  status: string;
  error?: string;
}

/**
 * Obtém o status de um container: docker inspect --format '{{.State.Status}}' <name>.
 * Retorna { running: true, status: 'running' } ou { running: false, status: 'exited'|'created'|... }.
 */
export function dockerContainerStatus(containerName: string): Promise<DockerContainerStatus> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'docker' : 'docker';
    const args = ['inspect', '--format', '{{.State.Status}}', containerName];

    const proc = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      const status = (stdout || stderr || '').trim().toLowerCase() || 'unknown';
      if (code !== 0) {
        resolve({
          running: false,
          status: 'not_found',
          error: stderr?.trim() || (status === 'unknown' ? 'Container não encontrado' : undefined),
        });
        return;
      }
      resolve({
        running: status === 'running',
        status: status || 'unknown',
      });
    });

    proc.on('error', (err) => {
      resolve({
        running: false,
        status: 'error',
        error: err?.message || String(err),
      });
    });
  });
}
