import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UserDocument } from '../users/schemas/user.schema';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Sign up. */
  @Public()
  @Post('register')
  register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  /**
   * Sign in. The LocalAuthGuard validates the credentials (via LocalStrategy)
   * and attaches the user to the request. `LoginDto` documents/validates the
   * request body.
   */
  @Public()
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() _loginDto: LoginDto, @Request() req: { user: UserDocument }) {
    return this.authService.login(req.user);
  }

  /**
   * Sign out. JWTs are stateless, so logout is a client-side concern: the
   * client discards the token. This endpoint acknowledges the action and is
   * the hook point for future token revocation if needed.
   */
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout() {
    return { message: 'Logged out successfully' };
  }
}
