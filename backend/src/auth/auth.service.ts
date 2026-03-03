import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

type ThemePreference = 'light' | 'dark' | 'auto';
type DateFormatPreference = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
type TimeFormatPreference = '12' | '24';

interface UpdatePreferencesDto {
  theme?: ThemePreference;
  country?: string;
  dateFormat?: DateFormatPreference;
  timeFormat?: TimeFormatPreference;
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService
  ) { }

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOne(email);
    if (user && await bcrypt.compare(pass, user.password)) {
      // Convert MikroORM entity to plain object
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        themePreference: user.themePreference,
        countryPreference: user.countryPreference,
        dateFormatPreference: user.dateFormatPreference,
        timeFormatPreference: user.timeFormatPreference,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      };
    }
    return null;
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        themePreference: user.themePreference || 'light',
        countryPreference: user.countryPreference || '',
        dateFormatPreference: user.dateFormatPreference || 'DD/MM/YYYY',
        timeFormatPreference: user.timeFormatPreference || '24',
      }
    };
  }

  async register(registerDto: any) {
    const email =
      typeof registerDto?.email === 'string'
        ? registerDto.email.trim().toLowerCase()
        : '';
    const password =
      typeof registerDto?.password === 'string' ? registerDto.password : '';
    const name = typeof registerDto?.name === 'string' ? registerDto.name.trim() : '';
    const code = typeof registerDto?.code === 'string' ? registerDto.code.trim() : '';

    if (!email || !password || !name) {
      throw new BadRequestException('Email, password and name are required');
    }

    const validCode = process.env.REGISTER;
    if (validCode && code !== validCode) {
      throw new UnauthorizedException('Invalid verification code. Please contact Lida Software.');
    }

    const existingUser = await this.usersService.findOne(email);
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    return this.usersService.create({
      email,
      password: hashedPassword,
      name,
    });
  }

  async verifyInvitationCode(code: string) {
    const validCode = process.env.REGISTER;
    if (validCode && code !== validCode) {
      throw new UnauthorizedException('Invalid verification code. Please contact Lida Software.');
    }
    return { success: true };
  }

  // Deprecated helper to keep old code valid if called, but implementation changed
  async validatePassword(password: string): Promise<boolean> {
    // Logic moved to validateUser
    return false;
  }

  async getPreferences(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      theme: user.themePreference || 'light',
      country: user.countryPreference || '',
      dateFormat: user.dateFormatPreference || 'DD/MM/YYYY',
      timeFormat: user.timeFormatPreference || '24',
    };
  }

  async updatePreferences(userId: number, dto: UpdatePreferencesDto) {
    const patch: {
      themePreference?: ThemePreference;
      countryPreference?: string;
      dateFormatPreference?: DateFormatPreference;
      timeFormatPreference?: TimeFormatPreference;
    } = {};

    if (dto.theme && ['light', 'dark', 'auto'].includes(dto.theme)) {
      patch.themePreference = dto.theme;
    }

    if (typeof dto.country === 'string') {
      patch.countryPreference = dto.country;
    }

    if (dto.dateFormat && ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].includes(dto.dateFormat)) {
      patch.dateFormatPreference = dto.dateFormat;
    }

    if (dto.timeFormat && ['12', '24'].includes(dto.timeFormat)) {
      patch.timeFormatPreference = dto.timeFormat;
    }

    const updatedUser = await this.usersService.updatePreferences(userId, patch);
    if (!updatedUser) {
      throw new UnauthorizedException('User not found');
    }

    return {
      theme: updatedUser.themePreference || 'light',
      country: updatedUser.countryPreference || '',
      dateFormat: updatedUser.dateFormatPreference || 'DD/MM/YYYY',
      timeFormat: updatedUser.timeFormatPreference || '24',
    };
  }
}
