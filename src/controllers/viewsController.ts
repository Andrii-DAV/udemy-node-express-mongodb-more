import { catchAsync } from '../utils/catchAsync';
import Tour from '../models/tourModel';
import AppError from '../utils/appError';
import Booking from '../models/bookingModel';
import { isAuthenticated } from '../utils/auth';

export const redirectIfLogged = catchAsync(async (req, res, next) => {
  if (res.locals.user) {
    return res.redirect('/');
  }
  next();
});
export const redirectToLogin = catchAsync(async (req, res, next) => {
  if (!isAuthenticated(req)) {
    return res.redirect('/login');
  }
  next();
});

export const getMyTours = catchAsync(async (req, res) => {
  const bookings = await Booking.find({
    user: req.user._id,
  });
  const tourIDs = bookings.map(({ tour }) => tour);
  const tours = await Tour.find({ _id: { $in: tourIDs } });

  res.status(200).render('overview', {
    title: 'My Tours',
    tours,
  });
});
export const getAccount = catchAsync(async (req, res) => {
  res.status(200).render('account', {
    title: 'My account',
  });
});

export const getOverview = catchAsync(async (req, res) => {
  const tours = await Tour.find();

  res.status(200).render('overview', {
    title: 'All Tours',
    tours,
  });
});

export const getLogin = catchAsync(async (req, res) => {
  if (req.user) return res.redirect('/');

  res.status(200).render('login', {
    title: 'Log into your account',
  });
});
export const getTour = catchAsync(async (req, res, next) => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const tour = await Tour.findOne({ slug: req.params.slug }).populate({
    path: 'reviews',
    fields: 'review rating user',
  });

  if (!tour) {
    return next(new AppError('There is no tour with that name.', 404));
  }

  res.status(200).render('tour', {
    title: `${tour.name} tour`,
    tour: tour,
  });
});
