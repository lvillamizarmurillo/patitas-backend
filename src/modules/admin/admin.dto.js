exports.toAdminUserDTO = (u) => ({
  id: u.id, role: u.role, fullName: u.fullName, email: u.email, phone: u.phone, city: u.city,
  isVerified: Boolean(u.isVerified), verifiedAt: u.verifiedAt, createdAt: u.createdAt,
  isSuspended: Boolean(u.suspendedAt), suspendedAt: u.suspendedAt, suspensionReason: u.suspensionReason,
});
