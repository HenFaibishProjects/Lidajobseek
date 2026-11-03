import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface AuthenticatedRequest {
  user?: {
    email?: string;
  };
}

@Injectable()
export class IntelligenceOwnerGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedEmail = this.config
      .get<string>('INTELLIGENCE_ALLOWED_EMAIL')
      ?.trim()
      .toLowerCase();

    if (!allowedEmail) {
      throw new ForbiddenException('Intelligence access is not configured.');
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userEmail = request.user?.email?.trim().toLowerCase();

    if (!userEmail || userEmail !== allowedEmail) {
      throw new ForbiddenException('Intelligence access is restricted.');
    }

    return true;
  }
}
