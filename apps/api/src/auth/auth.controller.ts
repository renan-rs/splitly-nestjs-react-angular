import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthCookiesService } from './auth-cookies.service';
import { REFRESH_COOKIE } from './auth.constants';
import { AuthService } from './auth.service';
import type { AuthUser, RequestMeta } from './auth.types';
import { CsrfService } from './csrf.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto, RegisterDto, UserDto } from './dto/auth.dto';

const MINUTE_MS = 60_000;
const STRICT_LIMIT = { default: { limit: 5, ttl: MINUTE_MS } };
const AUTH_LIMIT = { default: { limit: 20, ttl: MINUTE_MS } };
const USER_AGENT_MAX_LENGTH = 255;

function toUserDto(user: UserDto): UserDto {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

function metaOf(request: Request): RequestMeta {
  return {
    ip: request.ip ?? null,
    userAgent: request.get('user-agent')?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
  };
}

function refreshCookieOf(request: Request): string | undefined {
  return (request.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE];
}

@ApiTags('auth')
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded.' })
@Throttle(AUTH_LIMIT)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookiesService,
    private readonly csrf: CsrfService,
  ) {}

  @Public()
  @Get('csrf')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Issue the XSRF-TOKEN cookie to echo in the X-XSRF-TOKEN header.' })
  @ApiNoContentResponse({ description: 'The XSRF-TOKEN cookie was set.' })
  async issueCsrf(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.cookies.setCsrf(response, await this.csrf.contextFor(request));
  }

  @Public()
  @Throttle(STRICT_LIMIT)
  @Post('register')
  @ApiOperation({ summary: 'Create an account and start a session.' })
  @ApiCreatedResponse({ type: UserDto })
  @ApiForbiddenResponse({ description: 'Missing or invalid CSRF token.' })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserDto> {
    const session = await this.auth.register(dto, metaOf(request));
    this.startSession(response, session);
    return toUserDto(session.user);
  }

  @Public()
  @Throttle(STRICT_LIMIT)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password.' })
  @ApiOkResponse({ type: UserDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password.' })
  @ApiForbiddenResponse({ description: 'Missing or invalid CSRF token.' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserDto> {
    const session = await this.auth.login(dto, metaOf(request));
    this.startSession(response, session);
    return toUserDto(session.user);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token.' })
  @ApiNoContentResponse({ description: 'New cookies were set.' })
  @ApiUnauthorizedResponse({ description: 'Invalid, expired or reused refresh token.' })
  @ApiForbiddenResponse({ description: 'Missing or invalid CSRF token.' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    try {
      const session = await this.auth.refresh(refreshCookieOf(request), metaOf(request));
      this.cookies.setSession(response, session);
    } catch (error) {
      if (error instanceof UnauthorizedException) this.cookies.clearSession(response);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current session. Idempotent.' })
  @ApiNoContentResponse({ description: 'The session is ended and cookies are cleared.' })
  @ApiForbiddenResponse({ description: 'Missing or invalid CSRF token.' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(refreshCookieOf(request));
    this.cookies.clearSession(response);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Revoke every session of the current user.' })
  @ApiNoContentResponse({ description: 'All sessions are revoked and cookies are cleared.' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  @ApiForbiddenResponse({ description: 'Missing or invalid CSRF token.' })
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logoutAll(user.id);
    this.cookies.clearSession(response);
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'The authenticated user.' })
  @ApiOkResponse({ type: UserDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  async me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return toUserDto(await this.auth.me(user.id));
  }

  private startSession(
    response: Response,
    session: { user: UserDto; accessToken: string; refreshToken: string },
  ): void {
    this.cookies.setSession(response, session);
    // Bound to the new user, replacing the anonymous token used for the login request itself.
    this.cookies.setCsrf(response, session.user.id);
  }
}
