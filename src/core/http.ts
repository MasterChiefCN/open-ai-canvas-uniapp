import { configurationError, apiUrl } from './urls';
import { cookieHeader, receiveCookies } from './session';
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code?: number,
    public reason?: string,
    public retryAfterMs = 60000,
  ) {
    super(message);
  }
}
export class StaleRequestError extends Error {
  constructor() {
    super('会话已切换，请重新操作');
  }
}
let epoch = 0;
const pending = new Set<{ abort(): void }>();
let unauthorized: () => void = () => {};
export function setUnauthorizedHandler(handler: () => void) {
  unauthorized = handler;
}
export function requestEpoch() {
  return epoch;
}
export function assertEpoch(value: number) {
  if (value !== epoch) throw new StaleRequestError();
}
export function cancelRequests() {
  epoch++;
  for (const task of pending) task.abort();
  pending.clear();
}
export function unwrap<T>(body: unknown, status: number, headers: Record<string, unknown> = {}): T {
  let data = body;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      throw new ApiError('后端返回了非 JSON 内容，请检查 API 地址', status);
    }
  }
  const envelope = data as {
    code?: number;
    data?: T;
    msg?: string;
    reason?: string;
  } | null;
  const retry = Object.entries(headers).find(([key]) => key.toLowerCase() === 'retry-after')?.[1];
  const retryMs = retry
    ? /^\d+$/.test(String(retry))
      ? Number(retry) * 1000
      : Math.max(1000, Date.parse(String(retry)) - Date.now())
    : 60000;
  if (status < 200 || status >= 300 || !envelope || envelope.code !== 0)
    throw new ApiError(
      envelope?.msg || '请求失败，请稍后重试',
      status,
      envelope?.code,
      envelope?.reason,
      Number.isFinite(retryMs) ? retryMs : 60000,
    );
  return envelope.data as T;
}
function handleError(error: unknown, guest: boolean) {
  if (!guest && error instanceof ApiError && (error.status === 401 || error.code === 401))
    unauthorized();
  return error;
}
export function request<T>(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  data?: object,
  guest = false,
): Promise<T> {
  const problem = configurationError();
  if (problem) return Promise.reject(new Error(problem));
  const captured = epoch;
  return new Promise((resolve, reject) => {
    const task = uni.request({
      url: apiUrl(path),
      method,
      data,
      timeout: 30000,
      header: { ...cookieHeader(), 'Content-Type': 'application/json' },
      success(response) {
        try {
          assertEpoch(captured);
          receiveCookies(response.cookies, response.header);
          resolve(unwrap<T>(response.data, response.statusCode, response.header));
        } catch (error) {
          reject(handleError(error, guest));
        }
      },
      fail() {
        reject(
          captured !== epoch
            ? new StaleRequestError()
            : new ApiError(
                method === 'POST'
                  ? '网络异常，提交结果未知，请先刷新核对，勿重复提交'
                  : '网络异常，请重试',
              ),
        );
      },
      complete() {
        pending.delete(task);
      },
    });
    pending.add(task);
  });
}
export function upload<T>(filePath: string): Promise<T> {
  const problem = configurationError();
  if (problem) return Promise.reject(new Error(problem));
  const captured = epoch;
  return new Promise((resolve, reject) => {
    const task = uni.uploadFile({
      url: apiUrl('/resources'),
      filePath,
      name: 'file',
      formData: { kind: 'image' },
      header: cookieHeader(),
      timeout: 60000,
      success(response) {
        try {
          assertEpoch(captured);
          const extra = response as typeof response & {
            cookies?: string[];
            header?: Record<string, unknown>;
          };
          receiveCookies(extra.cookies, extra.header);
          resolve(unwrap<T>(response.data, response.statusCode, extra.header));
        } catch (error) {
          reject(handleError(error, false));
        }
      },
      fail() {
        reject(
          captured !== epoch
            ? new StaleRequestError()
            : new ApiError('上传失败，请检查网络及文件大小'),
        );
      },
      complete() {
        pending.delete(task);
      },
    });
    pending.add(task);
  });
}
