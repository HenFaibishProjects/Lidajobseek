import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;

  const mockUsersService = {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updatePreferences: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
    
    jest.clearAllMocks();
    process.env.REGISTER = 'VALID_CODE';
  });

  describe('validateUser', () => {
    it('should return user object if password matches', async () => {
      const user = { id: 1, email: 'test@test.com', password: 'hashed_password', name: 'Test' };
      mockUsersService.findOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('test@test.com', 'password');

      expect(result).toBeDefined();
      expect(result.email).toBe(user.email);
      expect(result.password).toBeUndefined();
    });

    it('should return null if user not found', async () => {
      mockUsersService.findOne.mockResolvedValue(null);
      const result = await service.validateUser('none@test.com', 'password');
      expect(result).toBeNull();
    });

    it('should return null if password does not match', async () => {
      const user = { id: 1, email: 'test@test.com', password: 'hashed_password' };
      mockUsersService.findOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser('test@test.com', 'wrong');
      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should return access token and user info with onboarding status', async () => {
      const user = { id: 1, email: 'test@test.com', name: 'Test', hasSeenOnboarding: false };
      mockJwtService.sign.mockReturnValue('jwt_token');

      const result = await service.login(user);

      expect(result.access_token).toBe('jwt_token');
      expect(result.user.email).toBe(user.email);
      expect(result.user.hasSeenOnboarding).toBe(false);
    });
  });

  describe('register', () => {
    it('should throw BadRequestException if fields are missing', async () => {
      await expect(service.register({})).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException if invitation code is invalid', async () => {
      const dto = { email: 't@t.com', password: 'p', name: 'n', code: 'INVALID' };
      await expect(service.register(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ConflictException if email already exists', async () => {
      const dto = { email: 'exist@t.com', password: 'p', name: 'n', code: 'VALID_CODE' };
      mockUsersService.findOne.mockResolvedValue({ id: 1 });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });

    it('should hash password and create user', async () => {
      const dto = { email: 'new@t.com', password: 'p', name: 'n', code: 'VALID_CODE' };
      mockUsersService.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      mockUsersService.create.mockResolvedValue({ id: 2, ...dto });

      const result = await service.register(dto);

      expect(bcrypt.hash).toHaveBeenCalledWith('p', 10);
      expect(mockUsersService.create).toHaveBeenCalled();
      expect(result.id).toBe(2);
    });
  });

  describe('getPreferences', () => {
    it('should return user preferences including onboarding flag', async () => {
      mockUsersService.findById.mockResolvedValue({ id: 1, themePreference: 'dark', avatarStylePreference: 'bottts', hasSeenOnboarding: true });
      const result = await service.getPreferences(1);
      expect(result.theme).toBe('dark');
      expect(result.avatarStyle).toBe('bottts');
      expect(result.hasSeenOnboarding).toBe(true);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockUsersService.findById.mockResolvedValue(null);
      await expect(service.getPreferences(999)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('updatePreferences', () => {
    it('should update preferences and return them', async () => {
      const dto = { theme: 'dark' as any };
      mockUsersService.updatePreferences.mockResolvedValue({ id: 1, themePreference: 'dark' });

      const result = await service.updatePreferences(1, dto);
      expect(result.theme).toBe('dark');
      expect(mockUsersService.updatePreferences).toHaveBeenCalledWith(1, { themePreference: 'dark' });
    });

    it('should update avatar style preference', async () => {
      const dto = { avatarStyle: 'pixel-art' };
      mockUsersService.updatePreferences.mockResolvedValue({ id: 1, avatarStylePreference: 'pixel-art' });

      const result = await service.updatePreferences(1, dto);

      expect(result.avatarStyle).toBe('pixel-art');
      expect(mockUsersService.updatePreferences).toHaveBeenCalledWith(1, { avatarStylePreference: 'pixel-art' });
    });

    it('should update hasSeenOnboarding preference', async () => {
      const dto = { hasSeenOnboarding: true };
      mockUsersService.updatePreferences.mockResolvedValue({ id: 1, hasSeenOnboarding: true });

      const result = await service.updatePreferences(1, dto);

      expect(result.hasSeenOnboarding).toBe(true);
      expect(mockUsersService.updatePreferences).toHaveBeenCalledWith(1, { hasSeenOnboarding: true });
    });

    it('should ignore invalid preference values', async () => {
      const dto = { theme: 'INVALID' as any };
      mockUsersService.updatePreferences.mockResolvedValue({ id: 1, themePreference: 'light' });

      await service.updatePreferences(1, dto);

      expect(mockUsersService.updatePreferences).toHaveBeenCalledWith(1, {});
    });

    it('should throw UnauthorizedException if user not found during update', async () => {
      mockUsersService.updatePreferences.mockResolvedValue(null);
      await expect(service.updatePreferences(999, {})).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verifyInvitationCode', () => {
    it('should return success if code matches', async () => {
      const result = await service.verifyInvitationCode('VALID_CODE');
      expect(result.success).toBe(true);
    });

    it('should throw UnauthorizedException if code mismatch', async () => {
      await expect(service.verifyInvitationCode('WRONG')).rejects.toThrow(UnauthorizedException);
    });
  });
});
