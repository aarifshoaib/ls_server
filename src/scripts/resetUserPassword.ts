/**
 * Reset a user's password with bcrypt and clear account lock.
 * Use when a user cannot login (e.g. old pbkdf2 hash or account locked).
 *
 * Usage: npx ts-node src/scripts/resetUserPassword.ts <email> <newPassword>
 * Example: npx ts-node src/scripts/resetUserPassword.ts admin@oms.com admin123
 */
import mongoose from 'mongoose';
import { config } from '../config';
import User from '../models/User';
import { AuthService } from '../services/auth.service';

async function main() {
  const [email, newPassword] = process.argv.slice(2);

  if (!email || !newPassword) {
    console.error('Usage: npx ts-node src/scripts/resetUserPassword.ts <email> <newPassword>');
    process.exit(1);
  }

  if (newPassword.length < 6) {
    console.error('Password must be at least 6 characters');
    process.exit(1);
  }

  try {
    await mongoose.connect(config.mongoUri);

    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user) {
      console.error(`User not found: ${email}`);
      process.exit(1);
    }

    const isBcryptHash = user.passwordHash.startsWith('$2');
    if (isBcryptHash) {
      console.log('User already has bcrypt hash. Resetting password and clearing lock...');
    } else {
      console.log('User has old hash format (pbkdf2). Migrating to bcrypt...');
    }

    const { hash: passwordHash, salt } = await AuthService.hashPassword(newPassword);

    await User.findByIdAndUpdate(user._id, {
      passwordHash,
      passwordSalt: salt,
      failedLoginAttempts: 0,
      lockedUntil: undefined,
    });

    console.log(`Password reset successfully for ${email}`);
    console.log('User can now login with the new password.');
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
