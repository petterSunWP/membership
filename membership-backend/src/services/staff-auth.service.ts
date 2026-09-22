import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { db } from '../config/db.js';

export async function loginStaff(
  email: string,
  password: string
) {
  const normalizedEmail = email.trim().toLowerCase();

  const [rows]: any = await db.query(
    `
    SELECT
      id,
      email,
      password_hash AS passwordHash,
      first_name AS firstName,
      last_name AS lastName,
      role,
      status
    FROM staff_users
    WHERE email = ?
    LIMIT 1
    `,
    [normalizedEmail]
  );

  if (rows.length === 0) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const staff = rows[0];

  if (staff.status !== 'ACTIVE') {
    throw new Error('STAFF_NOT_ACTIVE');
  }

  const passwordMatched = await bcrypt.compare(
    password,
    staff.passwordHash
  );

  if (!passwordMatched) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const token = jwt.sign(
    {
      staffUserId: staff.id,
      email: staff.email,
      role: staff.role,
      tokenType: 'STAFF',
    },
    process.env.JWT_SECRET!,
    {
      expiresIn: '8h',
    }
  );

  return {
    token,
    staff: {
      id: staff.id,
      email: staff.email,
      firstName: staff.firstName,
      lastName: staff.lastName,
      role: staff.role,
    },
  };
}