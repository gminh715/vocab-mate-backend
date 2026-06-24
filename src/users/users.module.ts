import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, UserSchema } from './schemas/user.schema';
import { MongooseModule } from '@nestjs/mongoose/dist/mongoose.module';

@Module({
  imports: [
    // Khai báo cho module này biết nó sử dụng schema User.
    // Việc này cung cấp Model (Mongoose) cho tính năng Dependency Injection để các Service có thể lấy ra dùng.
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  // Nơi định nghĩa các Controller phục vụ API routes
  controllers: [UsersController],
  // Nơi định nghĩa các logic của ứng dụng (Service) để Controller có thể Inject vào
  providers: [UsersService],
})
export class UsersModule { }
