import { SetMetadata } from '@nestjs/common';

import { PERMISSIONS_METADATA } from '../constants/authz.constants';
import { Permission } from '../interfaces';

/**
 * You can define multiple permissions, but only
 * when all of them satisfied, could you access the route.
 */
export const UsePermissions = (...permissions: Permission[]) => {
  return SetMetadata(PERMISSIONS_METADATA, permissions);
};
