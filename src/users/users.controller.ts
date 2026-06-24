import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users') // Phục vụ các endpoint có prefix bắt đầu từ: localhost:3000/users
export class UsersController {
  // Thay vì dùng từ khóa "new" để tạo Service, ta dùng kĩ thuật Dependency Injection của NestJS
  constructor(private readonly usersService: UsersService) { }

  @Post() // Bắt HTTP POST request (VD: tạo mới) 
  create(
    @Body()
    createUserDto: CreateUserDto
  ) {
    // Gọi layer UsersService để tiến hành xử lý logic ghi Database
    return this.usersService.create(createUserDto);
  }

  @Get() // Bắt HTTP GET request (Lấy danh sách)
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id') // Bắt HTTP GET kèm tham số động trên URL. VD: /users/1
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch() // Bắt HTTP PATCH để cập nhật 1 hoặc 1 vài phần của dữ liệu
  update(@Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(updateUserDto);
  }

  @Delete(':id') // Bắt HTTP DELETE
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
