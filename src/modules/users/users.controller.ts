// users.controller.ts
import sendResponse from '@/lib/response/response';
import { AppError } from '@/lib/response/AppError';
import catchAsync from '@/utils/catchAsync';
import { Request, Response } from 'express';
import { UsersSerializer } from './users.serializer';
import { UsersService } from './users.service';

const meHandler = catchAsync(async (req: Request, res: Response) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  const user = await UsersService.getCurrentUser(req.auth);

  return sendResponse.ok(res, UsersSerializer.currentUser(user), 'Current user retrieved');
});

export const UsersController = {
  meHandler,
};
