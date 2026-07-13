import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('media_items')
export class MediaItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column()
  fileName: string;

  @Column()
  mediaItemId: string;

  @Column({ type: 'varchar', nullable: true })
  baseUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  productUrl: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
