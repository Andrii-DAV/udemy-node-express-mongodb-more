import User, { IUser, type MongooseId, UserRole } from '../models/userModel';
import { catchAsync } from '../utils/catchAsync';
import jwt, { JwtPayload } from 'jsonwebtoken';
import AppError from '../utils/appError';
import { Types } from 'mongoose';
import { sendEmail } from '../utils/email';
import * as crypto from 'crypto';
import express from 'express';

const signToken = (id: MongooseId) =>
  jwt.sign(
    {
      id: id,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN },
  );

async function jwtVerify(
  token: string,
  secret: string,
): Promise<string | JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, secret, (err, decoded) => {
      if (err) return reject(err);
      resolve(decoded);
    });
  });
}

const createSendToken = (
  user: IUser,
  statusCode: number,
  res: express.Response,
) => {
  const token = signToken(user._id);

  res.cookie('jwt', token, {
    expires: new Date(
      Date.now() +
        Number(process.env.JWT_COOKIE_EXPIRES_IN) * 24 * 60 * 60 * 1000,
    ),
    secure: process.env.NODE_ENV !== 'development',
    httpOnly: true, //recieve - store - send automatically
  });

  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    data: user,
    token,
  });
};
export const signup = catchAsync(async (req, res, next) => {
  const { name, email, password, passwordConfirm } = req.body;

  const newUser = await User.create({
    name,
    email,
    password,
    passwordConfirm,
  });

  createSendToken(newUser, 201, res);
});

export const login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  const user = await User.findOne({ email }).select('+password');
  //@ts-ignore
  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('incorrect email or password', 401));
  }
  createSendToken(user, 200, res);
});

export const logout = catchAsync(async (req, res, next) => {
  res.cookie('jwt', null, {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  res.status(200).json({
    status: 'success',
  });
});

export const protect = catchAsync(async (req, res, next) => {
  // 1. Getting token
  const { headers } = req;
  let token;
  if (headers.authorization && headers.authorization.startsWith('Bearer')) {
    token = headers.authorization.split(' ')[1];
  } else if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(new AppError('Please log in to get access.', 401));
  }
  // 2. Verification token
  //@ts-ignore
  const { id, iat } = await jwtVerify(token, process.env.JWT_SECRET);

  // 3. Check if user still exists
  const foundUser = await User.findById(id);
  if (!foundUser) {
    return next(
      new AppError(
        'The user belonging to this token does no longer exist',
        401,
      ),
    );
  }

  // 4. Check if user has changed their password after token was issued
  //@ts-ignore
  if (foundUser.changedPasswordAfter(iat)) {
    return next(new AppError('User recently changed password!', 401));
  }
  req.user = foundUser;
  next();
});

export const restrictTo = (...roles: UserRole[]) =>
  catchAsync(async (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action', 403),
      );
    }

    next();
  });

export const forgotPassword = catchAsync(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new AppError('There is no user with email address', 404));
  }

  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  const resetURL = `${req.protocol}://${req.get(
    'host',
  )}/api/v1/users/resetPassword/${resetToken}`;

  const message = `Forgot your password? Submit a PATCH request with your new password and passwordConfirm to: ${resetURL}.
  If you didn't forget your password, please ignore this email!`;

  try {
    await sendEmail({
      email: user.email,
      subject: 'Your password reset token (valid for 10 minutes)',
      message,
    });

    res.status(200).json({
      status: 'success',
      message: 'Token sent to email!',
    });
  } catch (e) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    return next(
      new AppError(
        'There was an error sending the email. Try again later!',
        500,
      ),
    );
  }
});
export const resetPassword = catchAsync(async (req, res, next) => {
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  createSendToken(user, 200, res);
});

export const updatePassword = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id).select('+password');
  const { oldPassword, newPassword, passwordConfirm } = req.body;

  if (!oldPassword || !passwordConfirm || !newPassword) {
    return next(new AppError('Required fields are missing.', 400));
  }

  if (!(await user.correctPassword(oldPassword, user.password))) {
    return next(new AppError('Wrong passwords.', 400));
  }

  user.password = newPassword;
  user.passwordConfirm = passwordConfirm;

  await user.save();

  createSendToken(user, 200, res);
});
