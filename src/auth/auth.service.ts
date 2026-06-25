import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { JwtPayload } from '../common/interfaces';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Verifies credentials for the local strategy. Returns the user on success
   * or `null` on any failure (unknown email or wrong password).
   */
  async validateUser(
    email: string,
    password: string,
  ): Promise<UserDocument | null> {
    const user = await this.usersService.findByEmailWithPassword(email);
    if (!user) {
      return null;
    }

    const passwordMatches = await this.usersService.comparePassword(
      password,
      user.password,
    );
    return passwordMatches ? user : null;
  }

  /** Registers a new learner and issues a token. */
  async register(createUserDto: CreateUserDto) {
    const user = await this.usersService.create(createUserDto);
    return this.buildAuthResponse(user);
  }

  /** Issues a token for an already-authenticated user (login route). */
  login(user: UserDocument) {
    return this.buildAuthResponse(user);
  }

  /**
   * Builds the standard auth response. The `user` document's password hash is
   * stripped by the schema `toJSON` transform during serialization.
   */
  private buildAuthResponse(user: UserDocument) {
    const payload: JwtPayload = { sub: user._id.toString(), email: user.email };
    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }
}
