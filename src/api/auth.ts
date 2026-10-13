import { request } from '../core/http';
import type { AuthSettings, Session, VerificationMethod } from '../types/backend';
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
    phone?: string;
    smsCode?: string;
    ticket?: string;
    password: string;
    acceptedTerms: boolean;
  }) => request('/auth/register', 'POST', input, true),
  verification: (input: {
    purpose: 'login' | 'register';
    method: VerificationMethod;
    email?: string;
    phone?: string;
  }) =>
    request<{ ticket: string; expiresIn: number; retryAfter: number }>(
      '/auth/verification',
      'POST',
      input,
      true,
    ),
  loginVerification: (input: { ticket: string; emailCode?: string; smsCode?: string }) =>
    request('/auth/verification/login', 'POST', input, true),
  sendCode: (email: string, reset = false) =>
    request(reset ? '/auth/password-reset-code' : '/auth/email-code', 'POST', { email }, true),
  reset: (email: string, emailCode: string, password: string) =>
    request('/auth/password-reset', 'POST', { email, emailCode, password }, true),
  logout: () => request('/auth/logout', 'POST', undefined, true),
};
