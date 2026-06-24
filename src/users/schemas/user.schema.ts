import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// Định nghĩa kiểu dữ liệu kết hợp giữa class User và các phương thức có sẵn của Mongoose Document
export type UserDocument = HydratedDocument<User>;

@Schema() // Decorator đánh dấu class này là một Schema của MongoDB
export class User {
  // @Prop đánh dấu thuộc tính này là một field trong database
  // required: true -> bắt buộc phải nhập; unique: true -> không được phép trùng lặp
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true })
  name: string;

  @Prop() // Ngầm hiểu đây là một trường không bắt buộc (optional)
  phone: string;

  @Prop()
  age: number;

  @Prop()
  address: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

// Chuyển đổi User Class thành một định dạng Schema Mongoose thực thụ
export const UserSchema = SchemaFactory.createForClass(User);
