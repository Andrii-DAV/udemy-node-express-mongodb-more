import express from 'express';
import { CastError } from 'mongoose';
import AppError from '../utils/appError';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyError = any;
const sendErrorDev = (err: AnyError, res: express.Response) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

const sendErrorProd = (err: AnyError, res: express.Response) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });

    // Programming or other unknown error: don't leak error details
  } else {
    // 1) Log error
    // console.error('ERROR 💥', err);

    // 2) Send generic message
    res.status(500).json({
      status: 'error',
      message: 'Something went very wrong!',
    });
  }
};

const handleCastErrorDB = (err: CastError) => {
  const message = `Invalid ${err.path}: ${err.value}.`;
  return new AppError(message, 400);
};

const handleDuplicatedFieldsDB = (err: AnyError) => {
  const message = `Duplicate field value: ${Object.values(err.keyValue).join(
    ' ',
  )}. Please use another value!`;

  return new AppError(message, 400);
};
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const handleValidationErrorDB = (err: AnyError) => {
  const errors = Object.values(err?.errors)
    ?.map((e) => {
      // eslint-disable-next-line
      // @ts-ignore
      return e?.message;
    })
    .join(' ');
  const message = `Invalid input data. ${errors}`;

  return new AppError(message, 400);
};
export const handleError = (
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  err: AnyError,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = { ...err };

    if (err?.code === 11000) {
      error = handleDuplicatedFieldsDB(error);
    }
    if (err.name === 'CastError') {
      error = handleCastErrorDB(error);
    }
    if (err.name === 'ValidationError') {
      error = handleValidationErrorDB(error);
    }

    sendErrorProd(error, res);
  }
};
