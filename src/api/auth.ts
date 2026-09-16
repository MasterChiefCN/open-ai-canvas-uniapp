import { request } from '../core/http';
import type { AuthSettings, Session } from '../types/backend';
export const authApi = {
  settings: () => request<AuthSettings>('/auth/settings', 'GET', undefined, true),
  session: () => request<Session>('/auth/session', 'GET', undefined, true),
  login: (username: string, password: string) =>
    request('/auth/login', 'POST', { username, password }, true),
  register: (input: {
    username: string;
    displayName: string;
    email: string;
    emailCode: string;
    password: string;
  }) => request('/auth/register', 'POST', input, true),
  sendCode: (email: string, reset = false) =>
    request(reset ? '/auth/password-reset-code' : '/auth/email-code', 'POST', { email }, true),
  reset: (email: string, emailCode: string, password: string) =>
    request('/auth/password-reset', 'POST', { email, emailCode, password }, true),
  logout: () => request('/auth/logout', 'POST', undefined, true),
};
