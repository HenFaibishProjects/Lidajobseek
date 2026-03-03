import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Get,
  Patch,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: any) {
    const valid = await this.authService.validateUser(body.email, body.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.authService.login(valid);
  }

  @Public()
  @Post('register')
  async register(@Body() body: any) {
    return this.authService.register(body);
  }

  @Public()
  @Post('verify-code')
  async verifyCode(@Body('code') code: string) {
    return this.authService.verifyInvitationCode(code);
  }

  @Get('preferences')
  async getPreferences(@Req() req: any) {
    return this.authService.getPreferences(req.user.userId);
  }

  @Patch('preferences')
  async updatePreferences(@Req() req: any, @Body() body: any) {
    return this.authService.updatePreferences(req.user.userId, body);
  }
}
