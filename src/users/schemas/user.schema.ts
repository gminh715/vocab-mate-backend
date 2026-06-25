import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  EnglishLevel,
  LearningGoal,
  SubscriptionTier,
} from '../../common/enums';

export type UserDocument = HydratedDocument<User>;

/**
 * A learner on the platform.
 *
 * `timestamps: true` provides `createdAt`/`updatedAt` automatically.
 * The `toJSON` transform guarantees the password hash and internal fields
 * never leak through API responses.
 */
@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      delete ret.password;
      return ret;
    },
  },
})
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  // `select: false` keeps the hash out of every query unless explicitly requested
  // via `.select('+password')` (used only during authentication).
  @Prop({ required: true, select: false })
  password: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    type: String,
    enum: SubscriptionTier,
    default: SubscriptionTier.FREE,
  })
  subscriptionTier: SubscriptionTier;

  @Prop({ type: String, enum: LearningGoal, required: true })
  learningGoal: LearningGoal;

  @Prop({ type: String, enum: EnglishLevel, required: true })
  englishLevel: EnglishLevel;

  @Prop({ type: [String], default: [] })
  interests: string[];
}

export const UserSchema = SchemaFactory.createForClass(User);
