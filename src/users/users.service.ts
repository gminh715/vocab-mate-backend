import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { compare, genSalt, hash } from 'bcryptjs';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  private static readonly SALT_ROUNDS = 10;

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /** Hashes a plaintext password with a per-password salt. */
  async hashPassword(password: string): Promise<string> {
    const salt = await genSalt(UsersService.SALT_ROUNDS);
    return hash(password, salt);
  }

  /** Verifies a plaintext password against a stored hash. */
  comparePassword(password: string, hashed: string): Promise<boolean> {
    return compare(password, hashed);
  }

  /**
   * Registers a new learner. Rejects duplicate emails and stores only the
   * hashed password. The returned document never includes the hash
   * (`password` has `select: false`).
   */
  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const existing = await this.userModel
      .findOne({ email: createUserDto.email })
      .lean()
      .exec();

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const hashedPassword = await this.hashPassword(createUserDto.password);

    const created = await this.userModel.create({
      ...createUserDto,
      password: hashedPassword,
    });

    // Re-fetch so the response honours the `select: false` on password.
    return this.findById(created._id.toString());
  }

  /** Finds a user by id or throws 404. Password hash is excluded. */
  async findById(id: string): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('User not found');
    }

    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /**
   * Finds a user by email including the password hash — for authentication
   * only. Returns `null` when no match is found.
   */
  findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+password')
      .exec();
  }

  /** Updates the editable fields of a learner's profile. */
  async updateProfile(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!updated) {
      throw new NotFoundException('User not found');
    }
    return updated;
  }
}
