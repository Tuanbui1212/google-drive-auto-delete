import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('user_settings')
export class UserSetting {
  @PrimaryColumn()
  email: string;

  @Column({ default: 5 })
  delayMinutes: number;
}
