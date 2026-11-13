import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const getAdminCredentials = () => ({
  email: (process.env.ADMIN_EMAIL || 'admin@ridego.com').trim().toLowerCase(),
  password: process.env.ADMIN_PASSWORD || 'Admin@123',
  name: process.env.ADMIN_NAME || 'System Admin',
});

const ensureDefaultAdmin = async () => {
  const { email, password, name } = getAdminCredentials();

  let admin = await User.findOne({ email });

  if (!admin) {
    admin = await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 10),
      role: 'admin',
      isActive: true,
    });

    console.log(`Default admin account created for ${email}`);
    return admin;
  }

  if (admin.role !== 'admin') {
    admin.role = 'admin';
    await admin.save();
  }

  if (!admin.isActive) {
    admin.isActive = true;
    await admin.save();
  }

  return admin;
};

export default ensureDefaultAdmin;
