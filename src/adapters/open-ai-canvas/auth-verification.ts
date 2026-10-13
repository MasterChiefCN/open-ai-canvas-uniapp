import type { VerificationMethod, VerificationPolicy } from '../../types/backend';

export const verificationLabels: Record<VerificationMethod, string> = {
  email: '邮箱验证码',
  sms: '短信验证码',
  sms_email: '短信 + 邮箱验证',
};
export function verificationMethods(
  policy: VerificationPolicy,
  purpose: 'login' | 'register',
): VerificationMethod[] {
  if (purpose === 'login')
    return [
      ...(policy.emailLogin ? ['email' as const] : []),
      ...(policy.smsLogin ? ['sms' as const] : []),
    ];
  if (policy.smsAndEmailRegistration) return ['sms_email'];
  return [
    ...(policy.emailRegistration ? ['email' as const] : []),
    ...(policy.smsRegistration ? ['sms' as const] : []),
  ];
}
export function verificationContact(method: VerificationMethod, email: string, phone: string) {
  const contact = {
    email: method === 'sms' ? '' : email.trim().toLowerCase(),
    phone: method === 'email' ? '' : phone.trim(),
  };
  if (method !== 'sms' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email))
    throw new Error('请输入有效邮箱');
  if (method !== 'email' && !/^(?:\+86)?1[3-9]\d{9}$/.test(contact.phone))
    throw new Error('请输入中国大陆手机号，可带 +86');
  return contact;
}
export function verificationCodes(method: VerificationMethod, emailCode: string, smsCode: string) {
  if (method !== 'sms' && !/^\d{6}$/.test(emailCode)) throw new Error('请输入 6 位邮箱验证码');
  if (method !== 'email' && !/^\d{6}$/.test(smsCode)) throw new Error('请输入 6 位短信验证码');
  return {
    emailCode: method === 'sms' ? '' : emailCode,
    smsCode: method === 'email' ? '' : smsCode,
  };
}
