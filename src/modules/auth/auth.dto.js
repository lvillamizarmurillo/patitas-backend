exports.toUserDTO = (u) => ({
  id: u.id, fullName: u.fullName, email: u.email, phone: u.phone, role: u.role, city: u.city, isVerified: Boolean(u.isVerified),
});
