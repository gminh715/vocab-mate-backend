import { Injectable } from '@nestjs/common';
import { User } from './schemas/user.schema';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { genSaltSync, hashSync } from 'bcryptjs';
import { CreateUserDto } from './dto/create-user.dto';
import mongoose from 'mongoose';

@Injectable() // Đánh dấu class này là service để NestJS có thể nhúng vào controller qua constructor
export class UsersService {

  constructor(
    // Xin một Model tên User.name từ hệ thống Mongoose đã đăng ký trong Module
    @InjectModel(User.name)
    private userModel: Model<User>
  ) { }

  // Hàm tạo mã băm dựa vào đoạn plaintext (không che giấu mật khẩu thực)
  getHashPassword(password: string) {
    const salt = genSaltSync(10); // Tạo ra đoạn "muối" (salt) sinh ngẫu nhiên
    const hash = hashSync(password, salt); // Hòa với mật khẩu ra mã hóa
    return hash;
  }

  // Code logic việc tạo mới User
  async create(createUserDto: CreateUserDto) {
    const hashPassword = this.getHashPassword(createUserDto.password);
    // 2. Chèn đối tượng vào MongoDB thông qua Mongoose Model (sử dụng toán tử await)
    let user = await this.userModel.create({
      email: createUserDto.email,
      password: hashPassword,
      name: createUserDto.name,
    });
    return user;
  }

  findAll() {
    return `This action returns all users`;
  }

  findOne(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return 'Not found user';
    }
    return this.userModel.findOne({ _id: id });
  }

  async update(updateUserDto: UpdateUserDto) {
    return await this.userModel.updateOne({ _id: updateUserDto._id }, { ...updateUserDto });
  }

  remove(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return 'Not found user';
    }
    return this.userModel.deleteOne({ _id: id });
  }
}
