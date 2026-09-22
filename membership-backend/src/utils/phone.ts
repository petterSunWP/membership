export function normalizeNZPhone(phone: string) {
  let value = phone.trim();

  // 去掉空格、横线、括号
  value = value.replace(/[\s()-]/g, '');

  // +64xxxxxxxx → 0xxxxxxxx
  if (value.startsWith('+64')) {
    value = '0' + value.slice(3);
  }

  // 64xxxxxxxx → 0xxxxxxxx
  if (value.startsWith('64') && !value.startsWith('640')) {
    value = '0' + value.slice(2);
  }

  return value;
}