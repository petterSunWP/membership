export function clearStaffSession() {
  localStorage.removeItem('staff_token');
  localStorage.removeItem('staff_user');
}