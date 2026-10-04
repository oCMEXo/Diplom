import { randomUUID } from "node:crypto";
import { prisma } from "@collab/db";
import { REFRESH_TOKEN_TTL_SECONDS } from "@collab/shared";
import type { GuestLoginInput, LoginInput, RegisterInput, UpdateProfileInput } from "@collab/shared";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { signAccessToken } from "../../lib/jwt.js";
import { generateRefreshToken, hashRefreshToken } from "../../lib/refresh-token.js";
import { AppError } from "../../lib/errors.js";

interface UserLike {
  id: string;
  email: string;
  name: string;
  isGuest: boolean;
}

function toAuthUser(user: UserLike) {
  return { id: user.id, email: user.email, name: user.name, isGuest: user.isGuest };
}

async function issueTokens(user: { id: string; email: string }) {
  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refreshToken = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });

  return { accessToken, refreshToken };
}

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError("Этот email уже зарегистрирован", 409);
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: { email: input.email, name: input.name, passwordHash },
  });

  const tokens = await issueTokens(user);
  return { user: toAuthUser(user), tokens };
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
    throw new AppError("Неверный email или пароль", 401);
  }

  const tokens = await issueTokens(user);
  return { user: toAuthUser(user), tokens };
}

export async function loginAsGuest(input: GuestLoginInput) {
  const passwordHash = await hashPassword(randomUUID());
  const user = await prisma.user.create({
    data: {
      email: `guest-${randomUUID()}@guest.local`,
      name: input.name?.trim() || "Гость",
      passwordHash,
      isGuest: true,
    },
  });

  const tokens = await issueTokens(user);
  return { user: toAuthUser(user), tokens };
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const user = await prisma.user.update({ where: { id: userId }, data: { name: input.name.trim() } });
  return toAuthUser(user);
}

export async function refreshSession(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  const stored = await prisma.refreshToken.findFirst({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored || stored.expiresAt < new Date()) {
    throw new AppError("Сессия истекла. Войдите снова.", 401);
  }

  await prisma.refreshToken.delete({ where: { id: stored.id } });

  const tokens = await issueTokens(stored.user);
  return { user: toAuthUser(stored.user), tokens };
}

export async function revokeRefreshToken(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  await prisma.refreshToken.deleteMany({ where: { tokenHash } });
}
