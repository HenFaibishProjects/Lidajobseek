import { Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Template } from './template.entity';
import { User } from '../users/user.entity';

@Module({
  imports: [MikroOrmModule.forFeature([Template, User])],
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
