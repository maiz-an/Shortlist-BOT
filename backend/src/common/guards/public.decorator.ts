import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
/** Marks a route as reachable without authentication (health, login, OAuth callback). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
